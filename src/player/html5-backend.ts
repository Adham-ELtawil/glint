import type { MediaSource } from "../model/media";
import {
  emptySnapshot,
  STREAM_ERROR,
  type PlaybackBackend,
  type PlaybackSnapshot,
  type SubtitleCueTrack,
  type TimeRange,
  type VideoHealth,
} from "./backend";
import { reachedEnd } from "./end";
import { MseFeeder } from "./mse-feeder";

/**
 * Plays through the webview's HTML5 media engine (WebView2 on Windows,
 * WebKitGTK on Linux). Formats are whatever that engine can decode — typically
 * MP4 (H.264/AAC) and WebM. Files the engine can't play arrive with a
 * `stream` (Glint's bundled ffmpeg, fed through Media Source Extensions by
 * `MseFeeder`); the element and its events are the same either way.
 */
export class Html5Backend implements PlaybackBackend {
  readonly kind = "html5" as const;
  readonly video: HTMLVideoElement;
  private snapshot: PlaybackSnapshot = emptySnapshot();
  private listeners = new Set<() => void>();
  private trackUrl: string | null = null;
  private trackId: string | null = null;
  private onReady: (() => void) | null = null;
  private onFail: (() => void) | null = null;
  /** Chrome leaves video.ended true until a seek away from the end commits. */
  private suppressEnd = false;
  private feeder: MseFeeder | null = null;
  private streamFailure: string | null = null;

  constructor() {
    const video = document.createElement("video");
    video.className = "video";
    video.preload = "auto";
    video.playsInline = true;
    video.controls = false;
    video.setAttribute("playsinline", "");
    this.video = video;
    this.bind();
  }

  attach(container: HTMLElement): void {
    container.replaceChildren(this.video);
  }

  load(source: MediaSource): Promise<void> {
    this.suppressEnd = false;
    this.clearTracks();
    this.snapshot = {
      ...this.snapshot,
      status: "loading",
      currentTime: 0,
      duration: 0,
      buffered: [],
      buffering: true,
      errorCode: null,
      errorDetail: null,
      width: 0,
      height: 0,
    };
    this.emit();

    const video = this.video;
    this.detachLoad();
    video.pause();
    this.feeder?.dispose();
    this.feeder = null;
    this.streamFailure = null;

    return new Promise((resolve, reject) => {
      const onReady = () => {
        this.detachLoad();
        this.snapshot.status = "paused";
        this.snapshot.duration = finite(video.duration);
        this.snapshot.width = video.videoWidth;
        this.snapshot.height = video.videoHeight;
        this.snapshot.buffering = false;
        this.snapshot.errorCode = null;
        this.pullTime();
        this.emit();
        resolve();
      };
      const onFail = () => {
        this.detachLoad();
        const code = this.streamFailure ? STREAM_ERROR : (video.error?.code ?? 4);
        this.snapshot.status = "error";
        this.snapshot.errorCode = code;
        this.snapshot.errorDetail = this.streamFailure;
        this.snapshot.buffering = false;
        this.emit();
        reject(new Error(`media error ${code}`));
      };
      this.onReady = onReady;
      this.onFail = onFail;
      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("error", onFail);
      // CORS so subtitle blob tracks and range requests are allowed against
      // the loopback media server. The server sends Access-Control-Allow-Origin.
      video.crossOrigin = "anonymous";
      if (source.stream) {
        const feeder = new MseFeeder(video, source.stream);
        feeder.onFailure = (message) => this.failStream(feeder, message);
        this.feeder = feeder;
        // Setting src starts loading; calling load() again would detach the MediaSource.
        feeder.attach();
      } else {
        video.src = source.url;
        video.load();
      }
    });
  }

  videoHealth(): VideoHealth {
    const quality = this.video.getVideoPlaybackQuality?.();
    return {
      width: this.video.videoWidth,
      frames: quality ? quality.totalVideoFrames : null,
    };
  }

  private failStream(feeder: MseFeeder, message: string): void {
    if (feeder !== this.feeder) return;
    this.streamFailure = message;
    if (this.onFail) {
      this.onFail();
      return;
    }
    this.video.pause();
    this.snapshot.status = "error";
    this.snapshot.errorCode = STREAM_ERROR;
    this.snapshot.errorDetail = message;
    this.snapshot.buffering = false;
    this.emit();
  }

  async play(): Promise<void> {
    if (this.video.ended || this.snapshot.status === "ended") {
      this.suppressEnd = true;
      try {
        this.video.currentTime = 0;
      } catch {
        // The element can throw if metadata has not arrived. play() still runs.
      }
      this.snapshot.currentTime = 0;
      this.snapshot.status = "paused";
    }
    await this.video.play();
    if (this.finishIfEnded()) return;
    this.snapshot.status = "playing";
    this.snapshot.currentTime = finite(this.video.currentTime);
    this.snapshot.buffering = false;
    this.emit();
  }

  pause(): void {
    this.video.pause();
    if (this.snapshot.status !== "ended" && this.snapshot.status !== "error") {
      this.snapshot.status = "paused";
    }
    this.emit();
  }

  seek(time: number): void {
    const duration = finite(this.video.duration);
    const next = duration > 0 ? Math.min(Math.max(0, time), duration) : Math.max(0, time);
    const targetIsEnd = duration > 0 && next >= duration - 0.001;
    // Trust the requested time. The element can still report the old time and
    // ended=true until `seeked` fires, which would snap a replay back to the end.
    this.suppressEnd = !targetIsEnd;
    try {
      this.video.currentTime = next;
    } catch {
      this.suppressEnd = false;
      return;
    }
    this.snapshot.currentTime = next;
    if (targetIsEnd) {
      this.suppressEnd = false;
      this.markEnded();
      return;
    }
    if (this.snapshot.status === "ended") {
      this.snapshot.status = this.video.paused ? "paused" : "playing";
    }
    this.emit();
  }

  setVolume(volume: number): void {
    const next = Math.min(1, Math.max(0, volume));
    this.video.volume = next;
    this.snapshot.volume = next;
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted;
    this.snapshot.muted = muted;
    this.emit();
  }

  setRate(rate: number): void {
    this.video.playbackRate = rate;
    this.video.preservesPitch = true;
    this.snapshot.rate = rate;
    this.emit();
  }

  setSubtitles(track: SubtitleCueTrack | null): void {
    if (!track) {
      this.setTrackMode("hidden");
      return;
    }
    if (this.trackId === track.id) {
      this.setTrackMode("showing");
      return;
    }
    this.clearTracks();
    const vtt = /^WEBVTT\b/.test(track.vtt.trimStart()) ? track.vtt : `WEBVTT\n\n${track.vtt}`;
    const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    this.trackUrl = url;
    this.trackId = track.id;
    const element = document.createElement("track");
    element.kind = "subtitles";
    element.label = track.label;
    element.srclang = "en";
    element.src = url;
    element.default = true;
    this.video.appendChild(element);
    const show = () => this.setTrackMode("showing");
    element.addEventListener("load", show, { once: true });
    queueMicrotask(show);
  }

  getSnapshot(): PlaybackSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.detachLoad();
    this.feeder?.dispose();
    this.feeder = null;
    this.clearTracks();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.listeners.clear();
    this.video.remove();
  }

  private bind(): void {
    const video = this.video;
    video.addEventListener("timeupdate", () => this.pullTime());
    video.addEventListener("progress", () => this.pullTime());
    video.addEventListener("durationchange", () => {
      this.snapshot.duration = finite(video.duration);
      this.emit();
    });
    video.addEventListener("play", () => {
      if (this.finishIfEnded()) return;
      this.snapshot.status = "playing";
      this.emit();
    });
    video.addEventListener("playing", () => {
      if (this.finishIfEnded()) return;
      this.snapshot.status = "playing";
      this.snapshot.buffering = false;
      this.emit();
    });
    video.addEventListener("pause", () => {
      if (this.finishIfEnded()) return;
      if (this.snapshot.status !== "error") this.snapshot.status = "paused";
      this.pullTime();
    });
    video.addEventListener("ended", () => {
      this.markEnded();
    });
    video.addEventListener("seeked", () => {
      this.snapshot.buffering = false;
      this.noteSeekLanded();
      if (this.finishIfEnded()) return;
      this.pullTime();
    });
    video.addEventListener("canplay", () => {
      if (this.snapshot.buffering) {
        this.snapshot.buffering = false;
        this.emit();
      }
    });
    video.addEventListener("waiting", () => {
      if (this.finishIfEnded()) return;
      if (this.snapshot.status === "playing") {
        this.snapshot.buffering = true;
        this.emit();
      }
    });
    video.addEventListener("volumechange", () => {
      this.snapshot.volume = video.volume;
      this.snapshot.muted = video.muted;
      this.emit();
    });
    video.addEventListener("ratechange", () => {
      this.snapshot.rate = video.playbackRate;
      this.emit();
    });
  }

  private pullTime(): void {
    const video = this.video;
    const time = finite(video.currentTime);
    const duration = finite(video.duration);
    this.snapshot.currentTime = time;
    this.snapshot.duration = duration;
    this.snapshot.buffered = bufferedRanges(video);
    this.noteSeekLanded();
    if (!this.suppressEnd && video.ended) this.snapshot.status = "ended";
    this.emit();
  }

  /** Seeking onto the last instant, or a stall there, is the end screen — not a spinner. */
  private finishIfEnded(): boolean {
    if (this.suppressEnd) return false;
    const duration = finite(this.video.duration);
    const time = finite(this.video.currentTime);
    if (duration > 0 && time < duration - 0.25) return false;
    if (!reachedEnd(time, duration, this.video.ended)) return false;
    this.markEnded();
    return true;
  }

  private noteSeekLanded(): void {
    if (!this.suppressEnd) return;
    const duration = finite(this.video.duration);
    const time = finite(this.video.currentTime);
    if (duration > 0 && time < duration - 0.25) this.suppressEnd = false;
  }

  private markEnded(): void {
    this.suppressEnd = false;
    const duration = finite(this.video.duration);
    this.snapshot.status = "ended";
    this.snapshot.buffering = false;
    if (duration > 0) {
      this.snapshot.duration = duration;
      this.snapshot.currentTime = duration;
    }
    this.emit();
  }

  private setTrackMode(mode: TextTrackMode): void {
    const tracks = this.video.textTracks;
    for (let index = 0; index < tracks.length; index += 1) {
      tracks[index].mode = mode;
    }
  }

  private clearTracks(): void {
    for (const track of [...this.video.querySelectorAll("track")]) track.remove();
    if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
    this.trackUrl = null;
    this.trackId = null;
  }

  private detachLoad(): void {
    if (this.onReady) this.video.removeEventListener("loadedmetadata", this.onReady);
    if (this.onFail) this.video.removeEventListener("error", this.onFail);
    this.onReady = null;
    this.onFail = null;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function finite(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function bufferedRanges(video: HTMLVideoElement): TimeRange[] {
  const ranges: TimeRange[] = [];
  const buffered = video.buffered;
  for (let index = 0; index < buffered.length; index += 1) {
    ranges.push({ start: buffered.start(index), end: buffered.end(index) });
  }
  return ranges;
}
