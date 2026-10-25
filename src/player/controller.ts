import type { OpenedMedia, PlaylistItem } from "../model/media";
import type { PlaybackBackend, SubtitleCueTrack } from "./backend";
import { chapterAt, parseChapters, type Chapter } from "./chapters";
import { describeMediaError } from "./errors";
import { clampRate, formatRate, stepRate } from "./rates";
import { createResumeStore, resumePosition, type ResumeStore } from "./resume-store";
import type { ShortcutAction } from "./shortcuts";
import { srtToVtt } from "./subtitles";
import { clamp01, clampTime, formatTime } from "./time";
import { initialState, type FlashEffect, type PlayerState } from "./state";

export interface PlayerSink {
  onState(state: PlayerState): void;
  onFlash(effect: FlashEffect): void;
  onTitle(filename: string | null): void;
  onFullscreen(on: boolean): void;
  onTheater(on: boolean): void;
  /** Called whenever the position is saved, for watch history. */
  onProgress?(id: string, position: number, duration: number): void;
}

interface PreparedTrack extends SubtitleCueTrack {
  id: string;
}

const SEEK_BURST_MS = 850;
const SAVE_INTERVAL_MS = 2000;

/**
 * Owns playback policy: resume, per-file volume and speed, captions, chapters,
 * and keyboard actions. It does not touch the DOM or the filesystem.
 */
export class PlayerController {
  private media: OpenedMedia | null = null;
  private tracks: PreparedTrack[] = [];
  private chapters: Chapter[] = [];
  private captionsOn: boolean;
  private activeTrackId: string | null = null;
  private fullscreen = false;
  private theater = false;
  private resumeLabel: string | null = null;
  private opening = false;
  private forcedError = false;
  private errorTitle: string | null = null;
  private errorBody: string | null = null;
  private generation = 0;
  private lastSave = 0;
  private seekBurst = { direction: 0 as -1 | 0 | 1, amount: 0, at: 0 };
  private unsubscribe: () => void;

  constructor(
    private readonly backend: PlaybackBackend,
    private readonly store: ResumeStore,
    private readonly sink: PlayerSink,
  ) {
    const prefs = store.prefs();
    this.captionsOn = prefs.captions;
    this.backend.setVolume(prefs.volume);
    this.backend.setMuted(prefs.muted);
    this.backend.setRate(prefs.rate);
    this.unsubscribe = backend.subscribe(() => this.onBackend());
    this.publish();
  }

  getState(): PlayerState {
    return this.buildState();
  }

  playlist(): PlaylistItem[] {
    return this.media?.playlist ?? [];
  }

  peekNext(): PlaylistItem | null {
    const items = this.playlist();
    const index = this.indexOfCurrent();
    if (index < 0 || index + 1 >= items.length) return null;
    return items[index + 1];
  }

  async open(media: OpenedMedia): Promise<void> {
    this.persistPosition();
    const generation = ++this.generation;
    this.media = media;
    this.resumeLabel = null;
    this.errorTitle = null;
    this.errorBody = null;
    this.forcedError = false;
    this.chapters = [];
    this.tracks = [];
    this.activeTrackId = null;
    this.opening = true;
    this.publish();
    this.sink.onTitle(media.source.filename);

    const prefs = this.store.prefs();
    const memory = this.store.file(media.source.id);
    const volume = memory?.volume ?? prefs.volume;
    const muted = memory?.muted ?? prefs.muted;
    const rate = memory?.rate ?? prefs.rate;
    this.backend.setVolume(volume);
    this.backend.setMuted(muted);
    this.backend.setRate(rate);

    try {
      await this.backend.load(media.source);
    } catch {
      if (generation !== this.generation) return;
      this.opening = false;
      const code = this.backend.getSnapshot().errorCode;
      const copy = describeMediaError({
        filename: media.source.filename,
        code,
        extension: media.source.extension,
      });
      this.publishError(copy.title, copy.body);
      return;
    }
    if (generation !== this.generation) return;

    const duration = this.backend.getSnapshot().duration;
    const resumeAt = resumePosition(memory?.position ?? null, duration);
    if (resumeAt != null) {
      this.backend.seek(resumeAt);
      this.resumeLabel = `Resumed at ${formatTime(resumeAt, duration >= 3600)}`;
    }

    this.chapters = parseChapters(media.chaptersText, media.chaptersFormat);
    this.tracks = media.subtitles.map((file) => ({
      id: file.id,
      label: file.label,
      vtt: file.format === "srt" ? srtToVtt(file.content) : file.content,
    }));
    this.captionsOn = prefs.captions;
    if (this.captionsOn && this.tracks[0]) {
      this.activeTrackId = this.tracks[0].id;
      this.backend.setSubtitles(this.tracks[0]);
    } else {
      this.activeTrackId = null;
      this.backend.setSubtitles(null);
    }

    this.opening = false;
    this.publish();
    try {
      await this.backend.play();
    } catch {
      // Autoplay can be blocked outside the desktop webview. The paused
      // state keeps the control-bar play button, the same as YouTube desktop.
    }
    if (generation !== this.generation) return;
    this.publish();
  }

  handleShortcut(action: ShortcutAction): void {
    switch (action.type) {
      case "toggle-play":
        this.togglePlay();
        break;
      case "seek":
        this.seekBy(action.delta);
        break;
      case "seek-ratio":
        this.seekRatio(action.ratio);
        break;
      case "seek-start":
        this.seekTo(0);
        break;
      case "seek-end":
        this.seekTo(this.backend.getSnapshot().duration);
        break;
      case "volume":
        this.nudgeVolume(action.delta);
        break;
      case "toggle-mute":
        this.toggleMute();
        break;
      case "toggle-fullscreen":
        this.toggleFullscreen();
        break;
      case "toggle-captions":
        this.toggleCaptions();
        break;
      case "toggle-theater":
        this.toggleTheater();
        break;
      case "cycle-rate":
        this.cycleRate(action.direction);
        break;
      case "next":
        break;
      case "escape":
        if (this.fullscreen) this.setFullscreen(false);
        break;
      default:
        break;
    }
  }

  togglePlay(): void {
    if (!this.canControl()) return;
    const status = this.backend.getSnapshot().status;
    if (status === "ended") {
      this.backend.seek(0);
      void this.backend.play();
      this.resumeLabel = null;
      this.sink.onFlash({ kind: "play" });
      this.publish();
      return;
    }
    if (status === "playing") {
      this.backend.pause();
      this.persistPosition(true);
      this.sink.onFlash({ kind: "pause" });
    } else {
      void this.backend.play();
      this.sink.onFlash({ kind: "play" });
    }
    this.publish();
  }

  seekBy(delta: number): void {
    if (!this.canControl()) return;
    const snapshot = this.backend.getSnapshot();
    this.seekTo(snapshot.currentTime + delta, false);
    const direction: -1 | 1 = delta < 0 ? -1 : 1;
    const now = Date.now();
    if (this.seekBurst.direction === direction && now - this.seekBurst.at < SEEK_BURST_MS) {
      this.seekBurst.amount += Math.abs(delta);
    } else {
      this.seekBurst.direction = direction;
      this.seekBurst.amount = Math.abs(delta);
    }
    this.seekBurst.at = now;
    const unit = this.seekBurst.amount === 1 ? "second" : "seconds";
    this.sink.onFlash({
      kind: "seek",
      direction,
      label: `${this.seekBurst.amount} ${unit}`,
    });
  }

  seekRatio(ratio: number): void {
    if (!this.canControl()) return;
    const duration = this.backend.getSnapshot().duration;
    this.seekTo(duration * clamp01(ratio));
  }

  seekTo(time: number, clearResume = true): void {
    if (!this.canControl()) return;
    const duration = this.backend.getSnapshot().duration;
    this.backend.seek(clampTime(time, duration));
    if (clearResume) this.resumeLabel = null;
    this.persistPosition(true);
    this.publish();
  }

  setVolume(volume: number): void {
    const next = clamp01(volume);
    this.backend.setVolume(next);
    if (next === 0) this.backend.setMuted(true);
    else if (this.backend.getSnapshot().muted) this.backend.setMuted(false);
    this.persistAudio();
    this.publish();
  }

  nudgeVolume(delta: number): void {
    const snapshot = this.backend.getSnapshot();
    const next = clamp01(snapshot.volume + delta);
    this.setVolume(next);
    const after = this.backend.getSnapshot();
    const label =
      after.muted || after.volume === 0 ? "Muted" : `${Math.round(after.volume * 100)}%`;
    this.sink.onFlash({ kind: "volume", label });
  }

  toggleMute(): void {
    const snapshot = this.backend.getSnapshot();
    if (snapshot.muted || snapshot.volume === 0) {
      if (snapshot.volume === 0) this.backend.setVolume(0.5);
      this.backend.setMuted(false);
      const volume = this.backend.getSnapshot().volume;
      this.sink.onFlash({ kind: "volume", label: `${Math.round(volume * 100)}%` });
    } else {
      this.backend.setMuted(true);
      this.sink.onFlash({ kind: "volume", label: "Muted" });
    }
    this.persistAudio();
    this.publish();
  }

  setRate(rate: number): void {
    const next = clampRate(rate);
    this.backend.setRate(next);
    this.persistAudio();
    this.publish();
  }

  cycleRate(direction: -1 | 1): void {
    const next = stepRate(this.backend.getSnapshot().rate, direction);
    this.backend.setRate(next);
    this.persistAudio();
    this.sink.onFlash({ kind: "rate", label: formatRate(next) });
    this.publish();
  }

  toggleCaptions(): void {
    if (this.tracks.length === 0) return;
    this.captionsOn = !this.captionsOn;
    this.store.setCaptions(this.captionsOn);
    if (this.captionsOn) {
      const track = this.tracks.find((item) => item.id === this.activeTrackId) ?? this.tracks[0];
      this.activeTrackId = track.id;
      this.backend.setSubtitles(track);
    } else {
      this.backend.setSubtitles(null);
    }
    this.publish();
  }

  selectTrack(id: string | null): void {
    if (id == null) {
      this.captionsOn = false;
      this.activeTrackId = null;
      this.store.setCaptions(false);
      this.backend.setSubtitles(null);
      this.publish();
      return;
    }
    const track = this.tracks.find((item) => item.id === id);
    if (!track) return;
    this.activeTrackId = track.id;
    this.captionsOn = true;
    this.store.setCaptions(true);
    this.backend.setSubtitles(track);
    this.publish();
  }

  addSubtitle(track: PreparedTrack): void {
    this.tracks = [...this.tracks.filter((item) => item.id !== track.id), track];
    this.selectTrack(track.id);
  }

  toggleFullscreen(): void {
    this.setFullscreen(!this.fullscreen);
  }

  setFullscreen(on: boolean): void {
    if (this.fullscreen === on) return;
    this.fullscreen = on;
    this.sink.onFullscreen(on);
    this.publish();
  }

  noteFullscreen(on: boolean): void {
    if (this.fullscreen === on) return;
    this.fullscreen = on;
    this.publish();
  }

  toggleTheater(): void {
    this.setTheater(!this.theater);
  }

  setTheater(on: boolean): void {
    if (this.theater === on) return;
    this.theater = on;
    this.sink.onTheater(on);
    this.publish();
  }

  noteTheater(on: boolean): void {
    if (this.theater === on) return;
    this.theater = on;
    this.publish();
  }

  showFailure(body: string): void {
    this.backend.pause();
    this.forcedError = true;
    this.opening = false;
    this.errorTitle = "Couldn't open that file";
    this.errorBody = body;
    this.publish();
  }

  startOver(): void {
    if (!this.canControl()) return;
    this.backend.seek(0);
    this.resumeLabel = null;
    this.persistPosition(true);
    this.publish();
  }

  persist(): void {
    this.persistPosition(true);
    this.persistAudio();
  }

  destroy(): void {
    this.persist();
    this.unsubscribe();
    this.backend.destroy();
  }

  private onBackend(): void {
    const snapshot = this.backend.getSnapshot();
    if (!this.media) {
      this.publish();
      return;
    }
    if (snapshot.status === "error") {
      const copy = describeMediaError({
        filename: this.media.source.filename,
        code: snapshot.errorCode,
        extension: this.media.source.extension,
      });
      this.publishError(copy.title, copy.body);
      return;
    }
    const now = Date.now();
    if (snapshot.status === "playing" && now - this.lastSave > SAVE_INTERVAL_MS) {
      this.persistPosition();
    }
    this.publish();
  }

  private persistPosition(force = false): void {
    if (!this.media) return;
    const snapshot = this.backend.getSnapshot();
    if (snapshot.status === "idle" || snapshot.status === "loading") return;
    const now = Date.now();
    if (!force && now - this.lastSave < SAVE_INTERVAL_MS) return;
    this.lastSave = now;
    this.store.updateFile(this.media.source.id, { position: snapshot.currentTime });
    this.sink.onProgress?.(this.media.source.id, snapshot.currentTime, snapshot.duration);
  }

  /** The file that is loaded, if any. */
  currentId(): string | null {
    return this.media?.source.id ?? null;
  }

  /** Pause and save, e.g. when the home screen covers the player. */
  suspend(): void {
    if (this.backend.getSnapshot().status === "playing") this.backend.pause();
    this.persist();
    this.publish();
  }

  /** Resume after `suspend()`. */
  resumePlayback(): void {
    if (!this.canControl()) return;
    if (this.backend.getSnapshot().status === "ended") return;
    void this.backend.play().catch(() => {});
    this.publish();
  }

  private persistAudio(): void {
    const snapshot = this.backend.getSnapshot();
    const patch = { volume: snapshot.volume, muted: snapshot.muted, rate: snapshot.rate };
    if (this.media) this.store.updateFile(this.media.source.id, patch);
    else this.store.setDefaults(patch);
  }

  private canControl(): boolean {
    return this.media != null && !this.opening && this.buildPhase() === "ready";
  }

  private buildPhase(): PlayerState["phase"] {
    if (this.forcedError) return "error";
    if (!this.media) return "empty";
    if (this.opening) return "loading";
    const status = this.backend.getSnapshot().status;
    if (status === "error") return "error";
    if (status === "loading" || status === "idle") return "loading";
    return "ready";
  }

  private publishError(title: string, body: string): void {
    this.errorTitle = title;
    this.errorBody = body;
    this.opening = false;
    this.publish();
  }

  private publish(): void {
    this.sink.onState(this.buildState());
  }

  private indexOfCurrent(): number {
    if (!this.media) return -1;
    return this.media.playlist.findIndex((item) => item.id === this.media?.source.id);
  }

  private buildState(): PlayerState {
    const snapshot = this.backend.getSnapshot();
    const base = initialState();
    const phase = this.buildPhase();
    const next = this.peekNext();
    const playing = snapshot.status === "playing";
    return {
      ...base,
      phase,
      playing,
      ended: snapshot.status === "ended",
      buffering: phase === "loading" || (playing && snapshot.buffering),
      currentTime: snapshot.currentTime,
      duration: snapshot.duration,
      buffered: snapshot.buffered,
      volume: snapshot.volume,
      muted: snapshot.muted || snapshot.volume === 0,
      rate: snapshot.rate,
      filename: this.media?.source.filename ?? null,
      chapterTitle: chapterAt(this.chapters, snapshot.currentTime)?.title ?? null,
      chapters: this.chapters,
      hasNext: next != null,
      nextFilename: next?.filename ?? null,
      tracks: this.tracks.map((track) => ({ id: track.id, label: track.label })),
      activeTrackId: this.captionsOn ? this.activeTrackId : null,
      captionsOn: this.captionsOn && this.activeTrackId != null,
      errorTitle: phase === "error" ? this.errorTitle : null,
      errorBody: phase === "error" ? this.errorBody : null,
      fullscreen: this.fullscreen,
      theater: this.theater,
      resumeLabel: this.resumeLabel,
    };
  }
}

export function createController(
  backend: PlaybackBackend,
  sink: PlayerSink,
  store: ResumeStore = createResumeStore(localStorage),
): PlayerController {
  return new PlayerController(backend, store, sink);
}
