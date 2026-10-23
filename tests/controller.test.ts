import { describe, expect, it } from "vitest";
import type { OpenedMedia } from "../src/model/media";
import {
  emptySnapshot,
  type PlaybackBackend,
  type PlaybackSnapshot,
  type SubtitleCueTrack,
} from "../src/player/backend";
import { PlayerController } from "../src/player/controller";
import { createResumeStore, memoryStorage } from "../src/player/resume-store";
import type { ShortcutAction } from "../src/player/shortcuts";
import type { FlashEffect, PlayerState } from "../src/player/state";

class FakeBackend implements PlaybackBackend {
  readonly kind = "html5" as const;
  duration = 200;
  failCode: number | null = null;
  subtitles: string | null = null;
  private snapshot: PlaybackSnapshot = emptySnapshot();
  private listeners = new Set<() => void>();

  attach(): void {}

  async load(): Promise<void> {
    if (this.failCode != null) {
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        errorCode: this.failCode,
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
