import { describe, expect, it, vi } from "vitest";
import type { MediaSource as Source, OpenedMedia, StreamSource } from "../src/model/media";
import {
  emptySnapshot,
  type PlaybackBackend,
  type PlaybackSnapshot,
  type SubtitleCueTrack,
  type VideoHealth,
} from "../src/player/backend";
import { PICTURE_CHECK_MS, PlayerController } from "../src/player/controller";
import { createResumeStore, memoryStorage } from "../src/player/resume-store";
import type { ShortcutAction } from "../src/player/shortcuts";
import type { FlashEffect, PlayerState } from "../src/player/state";

class FakeBackend implements PlaybackBackend {
  readonly kind = "html5" as const;
  duration = 200;
  failCode: number | null = null;
  /** Fail only files the webview would play itself (no ffmpeg stream). */
  failNative = false;
  health: VideoHealth = { width: 640, frames: 24 };
  loaded: Source[] = [];
  subtitles: string | null = null;
  private snapshot: PlaybackSnapshot = emptySnapshot();
  private listeners = new Set<() => void>();

  attach(): void {}

  async load(source: Source): Promise<void> {
    this.loaded.push(source);
    if (this.failCode != null || (this.failNative && !source.stream)) {
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        errorCode: this.failCode ?? 4,
        currentTime: 0,
      };
      this.emit();
      throw new Error("unsupported");
    }
    this.snapshot = {
      ...this.snapshot,
      status: "paused",
      duration: this.duration,
      currentTime: 0,
      errorCode: null,
    };
    this.emit();
  }

  async play(): Promise<void> {
    this.snapshot = { ...this.snapshot, status: "playing" };
    this.emit();
  }

  pause(): void {
    this.snapshot = { ...this.snapshot, status: "paused" };
    this.emit();
  }

  seek(time: number): void {
    const next = Math.min(this.snapshot.duration, Math.max(0, time));
    this.snapshot = { ...this.snapshot, currentTime: next, status: "paused" };
    this.emit();
  }

  setVolume(volume: number): void {
    this.snapshot = { ...this.snapshot, volume };
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.snapshot = { ...this.snapshot, muted };
    this.emit();
  }

  setRate(rate: number): void {
    this.snapshot = { ...this.snapshot, rate };
    this.emit();
  }

  setSubtitles(track: SubtitleCueTrack | null): void {
    this.subtitles = track?.vtt ?? null;
  }

  getSnapshot(): PlaybackSnapshot {
    return this.snapshot;
  }

  videoHealth(): VideoHealth {
    return this.health;
  }

  advance(time: number): void {
    this.snapshot = { ...this.snapshot, currentTime: time };
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {}

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

class RecordingSink {
  state: PlayerState | null = null;
  flashes: FlashEffect[] = [];
  titles: Array<string | null> = [];
  fullscreen: boolean[] = [];
  theater: boolean[] = [];

  onState(state: PlayerState): void {
    this.state = state;
  }
  onFlash(effect: FlashEffect): void {
    this.flashes.push(effect);
  }
  onTitle(filename: string | null): void {
    this.titles.push(filename);
  }
  onFullscreen(on: boolean): void {
    this.fullscreen.push(on);
  }
  onTheater(on: boolean): void {
    this.theater.push(on);
  }
}

function media(id: string, extras: Partial<OpenedMedia> = {}): OpenedMedia {
  return {
    source: {
      id,
      path: id,
      url: `http://127.0.0.1/media/${id}`,
      filename: id.split("/").pop() ?? id,
      extension: "mp4",
    },
    playlist: [
      { id, path: id, url: `http://127.0.0.1/media/${id}`, filename: "a.mp4" },
      { id: `${id}-next`, path: `${id}-next`, url: "http://127.0.0.1/next", filename: "b.mp4" },
    ],
    subtitles: [],
    chaptersText: null,
    chaptersFormat: null,
    ...extras,
  };
}

describe("PlayerController", () => {
  it("restores per-file volume, speed, mute, and resume position", async () => {
    const store = createResumeStore(memoryStorage());
    store.updateFile("/videos/a.mp4", { position: 40, volume: 0.3, muted: true, rate: 1.5 });
    const backend = new FakeBackend();
    const sink = new RecordingSink();
    const player = new PlayerController(backend, store, sink);

    await player.open(media("/videos/a.mp4"));

    expect(backend.getSnapshot()).toMatchObject({
      currentTime: 40,
      volume: 0.3,
      muted: true,
      rate: 1.5,
      status: "playing",
    });
    expect(sink.state?.resumeLabel).toBe("Resumed at 0:40");
    expect(sink.titles.at(-1)).toBe("a.mp4");
  });

  it("does not resume the opening seconds or the last ten seconds", async () => {
    const store = createResumeStore(memoryStorage());
    store.updateFile("/videos/early.mp4", { position: 3 });
    const backend = new FakeBackend();
    const player = new PlayerController(backend, store, new RecordingSink());
    await player.open(media("/videos/early.mp4"));
    expect(backend.getSnapshot().currentTime).toBe(0);

    store.updateFile("/videos/late.mp4", { position: 195 });
    await player.open(media("/videos/late.mp4"));
    expect(backend.getSnapshot().currentTime).toBe(0);
  });

  it("seeks from shortcuts and converts a sidecar srt", async () => {
    const store = createResumeStore(memoryStorage());
    const backend = new FakeBackend();
    const sink = new RecordingSink();
    const player = new PlayerController(backend, store, sink);
    await player.open(
      media("/videos/a.mp4", {
        subtitles: [
          {
            id: "en",
            label: "English",
            format: "srt",
            content: "1\n00:00:01,000 --> 00:00:02,000\nHello\n",
          },
        ],
        chaptersText: JSON.stringify([{ start: 0, title: "Intro" }]),
        chaptersFormat: "json",
      }),
    );

    player.handleShortcut({ type: "seek", delta: -10 } satisfies ShortcutAction);
    expect(backend.getSnapshot().currentTime).toBe(0);
    player.handleShortcut({ type: "seek", delta: 10 });
    expect(backend.getSnapshot().currentTime).toBe(10);
    player.handleShortcut({ type: "seek-ratio", ratio: 0.5 });
    expect(backend.getSnapshot().currentTime).toBe(100);
    expect(sink.flashes.some((flash) => flash.kind === "seek")).toBe(true);

    expect(backend.subtitles).toContain("WEBVTT");
    expect(backend.subtitles).toContain("Hello");
    expect(sink.state?.chapterTitle).toBe("Intro");
    player.toggleCaptions();
    expect(backend.subtitles).toBeNull();
    expect(store.prefs().captions).toBe(false);

    player.cycleRate(1);
    expect(backend.getSnapshot().rate).toBe(1.25);
    expect(player.peekNext()?.filename).toBe("b.mp4");
  });

  it("shows a friendly error when the backend rejects the file", async () => {
    const backend = new FakeBackend();
    backend.failCode = 4;
    const sink = new RecordingSink();
    const player = new PlayerController(backend, createResumeStore(memoryStorage()), sink);
    await player.open(
      media("/videos/film.mkv", {
        source: {
          id: "/videos/film.mkv",
          path: "/videos/film.mkv",
          url: "http://127.0.0.1/film",
          filename: "film.mkv",
          extension: "mkv",
        },
      }),
    );
    expect(sink.state?.phase).toBe("error");
    expect(sink.state?.errorTitle).toBe("This file can't be played");
    expect(sink.state?.errorBody).toContain("film.mkv");
  });
});

describe("held-Space 2x boost", () => {
  async function ready(rate = 1.25) {
    const backend = new FakeBackend();
    const store = createResumeStore(memoryStorage());
    const sink = new RecordingSink();
    const player = new PlayerController(backend, store, sink);
    await player.open(media("/videos/boost.mp4"));
    player.setRate(rate);
    return { backend, store, sink, player };
  }

  it("plays at 2x while held and restores the custom speed after", async () => {
    const { backend, sink, player } = await ready(1.25);
    expect(backend.getSnapshot().status).toBe("playing");
    player.startBoost();
    expect(backend.getSnapshot().rate).toBe(2);
    expect(sink.state?.boosting).toBe(true);
    player.endBoost();
    expect(backend.getSnapshot().rate).toBe(1.25);
    expect(backend.getSnapshot().status).toBe("playing");
    expect(sink.state?.boosting).toBe(false);
  });

  it("from paused: plays during the hold and pauses again on release", async () => {
    const { backend, player } = await ready(1);
    player.togglePlay();
    expect(backend.getSnapshot().status).toBe("paused");
    player.startBoost();
    expect(backend.getSnapshot().status).toBe("playing");
    expect(backend.getSnapshot().rate).toBe(2);
    player.endBoost();
    expect(backend.getSnapshot().status).toBe("paused");
    expect(backend.getSnapshot().rate).toBe(1);
  });

  it("never saves 2x as the file's speed", async () => {
    const { store, player } = await ready(1.5);
    player.startBoost();
    player.setVolume(0.4);
    expect(store.file("/videos/boost.mp4")?.rate).toBe(1.5);
    player.endBoost();
  });

  it("opening another file mid-hold drops the boost", async () => {
    const { backend, player } = await ready(1);
    player.startBoost();
    await player.open(media("/videos/other.mp4"));
    expect(player.isBoosting()).toBe(false);
    expect(backend.getSnapshot().rate).not.toBe(2);
    player.endBoost();
    expect(backend.getSnapshot().rate).not.toBe(2);
  });

  describe("files Glint converts with ffmpeg", () => {
    const stream = (mode: StreamSource["mode"]): StreamSource => ({
      url: "http://127.0.0.1/stream/t1",
      mode,
      duration: 200,
      timeOffset: 10,
      hasVideo: true,
    });
    const withSource = (id: string, extra: Partial<Source>) => {
      const base = media(id);
      return { ...base, source: { ...base.source, ...extra } };
    };

    it("shows a brief converting note for streamed files only", async () => {
      const backend = new FakeBackend();
      const sink = new RecordingSink();
      const player = new PlayerController(backend, createResumeStore(memoryStorage()), sink);
      await player.open(withSource("/v/a.mkv", { stream: stream("audio") }));
      expect(sink.state?.convertNote).toBe("Converting audio…");
      await player.open(withSource("/v/b.avi", { stream: stream("video") }));
      expect(sink.state?.convertNote).toBe("Converting video…");
      await player.open(withSource("/v/c.mov", { stream: stream("remux") }));
      expect(sink.state?.convertNote).toBe("Converting…");
      await player.open(media("/v/d.mp4"));
      expect(sink.state?.convertNote).toBeNull();
    });

    it("retries a native file through ffmpeg when the webview rejects it", async () => {
      const store = createResumeStore(memoryStorage());
      store.updateFile("/v/odd.m4v", { position: 40 });
      const backend = new FakeBackend();
      backend.failNative = true;
      const sink = new RecordingSink();
      const player = new PlayerController(backend, store, sink);
      await player.open(withSource("/v/odd.m4v", { fallback: stream("remux") }));
      expect(backend.loaded.map((source) => source.stream?.mode ?? "native")).toEqual([
        "native",
        "remux",
      ]);
      expect(sink.state?.phase).toBe("ready");
      expect(sink.state?.convertNote).toBe("Converting…");
      // The failed attempt didn't wipe the saved position.
      expect(backend.getSnapshot().currentTime).toBe(40);
    });

    it("reports the error when there's nothing to fall back on", async () => {
      const backend = new FakeBackend();
      backend.failNative = true;
      const sink = new RecordingSink();
      const player = new PlayerController(backend, createResumeStore(memoryStorage()), sink);
      await player.open(media("/v/broken.mp4"));
      expect(backend.loaded).toHaveLength(1);
      expect(sink.state?.phase).toBe("error");
    });

    it("switches to ffmpeg when a native file plays with no picture", async () => {
      vi.useFakeTimers();
      try {
        const backend = new FakeBackend();
        // Sized at load, but no frame ever arrives.
        backend.health = { width: 640, frames: 0 };
        const sink = new RecordingSink();
        const player = new PlayerController(backend, createResumeStore(memoryStorage()), sink);
        await player.open(withSource("/v/blank.m4v", { fallback: stream("remux") }));
        backend.advance(2);
        await vi.advanceTimersByTimeAsync(PICTURE_CHECK_MS + 10);
        expect(backend.loaded.map((source) => source.stream?.mode ?? "native")).toEqual([
          "native",
          "remux",
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("switches straight away when the video track has no size", async () => {
      const backend = new FakeBackend();
      backend.health = { width: 0, frames: 0 };
      const sink = new RecordingSink();
      const player = new PlayerController(backend, createResumeStore(memoryStorage()), sink);
      await player.open(
        withSource("/v/hevc.mp4", { fallback: stream("remux"), transcode: stream("video") }),
      );
      expect(backend.loaded.map((source) => source.stream?.mode ?? "native")).toEqual([
        "native",
        "video",
      ]);
    });

    it("leaves a native file alone when it shows a picture", async () => {
      vi.useFakeTimers();
      try {
        const backend = new FakeBackend();
        const sink = new RecordingSink();
        const player = new PlayerController(backend, createResumeStore(memoryStorage()), sink);
        await player.open(withSource("/v/fine.mp4", { fallback: stream("remux") }));
        backend.advance(2);
        await vi.advanceTimersByTimeAsync(PICTURE_CHECK_MS * 5);
        expect(backend.loaded).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("converts HEVC to H.264 when this PC can't decode it", async () => {
      const backend = new FakeBackend();
      backend.failNative = true;
      const sink = new RecordingSink();
      const player = new PlayerController(backend, createResumeStore(memoryStorage()), sink);
      // A copied HEVC stream fails too, the way a missing decoder does.
      const failingCopy = backend.load.bind(backend);
      backend.load = async (source) => {
        if (source.stream && source.stream.mode !== "video") {
          backend.loaded.push(source);
          throw new Error("no HEVC decoder");
        }
        return failingCopy(source);
      };
      await player.open(
        withSource("/v/iphone.mov", { fallback: stream("remux"), transcode: stream("video") }),
      );
      expect(backend.loaded.map((source) => source.stream?.mode ?? "native")).toEqual([
        "native",
        "video",
      ]);
      await player.open(
        withSource("/v/hevc.mkv", { stream: stream("audio"), transcode: stream("video") }),
      );
      expect(backend.loaded.slice(2).map((source) => source.stream?.mode)).toEqual([
        "audio",
        "video",
      ]);
      expect(sink.state?.phase).toBe("ready");
      expect(sink.state?.convertNote).toBe("Converting video…");
    });
  });
});
