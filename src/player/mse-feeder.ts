import type { StreamSource } from "../model/media";
import { initSegmentEnd, mimeFor } from "./fmp4";

export interface FeederDeps {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  createMediaSource: () => MediaSource;
  createObjectURL: (source: MediaSource) => string;
  revokeObjectURL: (url: string) => void;
  delay: (ms: number) => Promise<void>;
}

/** How far ahead to read before pausing ffmpeg (it blocks on the pipe). */
export const MAX_AHEAD_S = 60;
/** How much already-played media to keep for instant seeks back. */
export const KEEP_BEHIND_S = 30;
/** Start a new conversion slightly before the seek target. */
const SEEK_LEAD_S = 0.25;

function browserDeps(): FeederDeps {
  return {
    fetch: (url, init) => fetch(url, init),
    createMediaSource: () => new window.MediaSource(),
    createObjectURL: (source) => URL.createObjectURL(source),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    delay: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/**
 * Feeds a `<video>` from ffmpeg's fragmented MP4 through Media Source
 * Extensions. Seeks inside what's buffered are instant; a seek outside it
 * aborts the current request (Rust then kills that ffmpeg) and starts a new
 * conversion at the target. Timestamps in the stream are the file's own, so
 * every session lands in the right place on one timeline.
 */
export class MseFeeder {
  private source: MediaSource | null = null;
  private buffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private disposed = false;
  private readonly onSeeking = () => this.handleSeeking();
  /** Called once when the stream can't be played at all. */
  onFailure: (message: string) => void = () => {};

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly stream: StreamSource,
    private readonly deps: FeederDeps = browserDeps(),
  ) {}

  attach(): void {
    const source = this.deps.createMediaSource();
    this.source = source;
    source.addEventListener(
      "sourceopen",
      () => {
        if (this.disposed) return;
        if (this.stream.duration > 0) {
          try {
            source.duration = this.stream.duration;
          } catch {
            // Duration then comes from the buffered media.
          }
        }
        void this.load(0);
      },
      { once: true },
    );
    this.video.addEventListener("seeking", this.onSeeking);
    this.objectUrl = this.deps.createObjectURL(source);
    this.video.src = this.objectUrl;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    this.video.removeEventListener("seeking", this.onSeeking);
    if (this.objectUrl) this.deps.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.buffer = null;
    this.source = null;
  }

  /** Seconds of media buffered ahead of the playhead. */
  ahead(): number {
    const ranges = this.buffer?.buffered;
    if (!ranges) return 0;
    const time = this.video.currentTime;
    for (let i = 0; i < ranges.length; i += 1) {
      if (time >= ranges.start(i) - 0.5 && time <= ranges.end(i)) return ranges.end(i) - time;
    }
    return 0;
  }

  /** Whether `time` can play from what's already buffered. */
  isBuffered(time: number): boolean {
    const ranges = this.buffer?.buffered;
    if (!ranges) return false;
    for (let i = 0; i < ranges.length; i += 1) {
      if (time >= ranges.start(i) && time < ranges.end(i) - 0.3) return true;
    }
    return false;
  }

  private handleSeeking(): void {
    if (this.disposed || !this.buffer) return;
    const time = this.video.currentTime;
    if (this.isBuffered(time)) return;
    void this.load(Math.max(0, time - SEEK_LEAD_S));
  }

  private async idle(): Promise<void> {
    const buffer = this.buffer;
    while (buffer && buffer.updating) {
      await new Promise<void>((resolve) =>
        buffer.addEventListener("updateend", () => resolve(), { once: true }),
      );
    }
  }

  private async load(start: number): Promise<void> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const current = () => generation === this.generation && !this.disposed;

    if (this.buffer) {
      await this.idle();
      if (!current()) return;
      // Drop the half-parsed fragment from the stream we just cut off.
      try {
        if (this.source?.readyState === "open") this.buffer.abort();
        this.buffer.timestampOffset = -this.stream.timeOffset;
      } catch {
        // The element is being torn down.
      }
    }

    let response: Response;
    try {
      response = await this.deps.fetch(`${this.stream.url}?t=${start.toFixed(3)}`, {
        signal: controller.signal,
      });
    } catch {
      if (current()) this.fail("Glint's converter didn't respond.");
      return;
    }
    if (!current()) return;
    if (!response.ok || !response.body) {
      this.fail("Glint couldn't convert this file.");
      return;
    }

    const reader = response.body.getReader();
    let pending = new Uint8Array(0);
    let sawInit = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (!current()) return;
        if (done) break;
        let chunk: Uint8Array = value;
        if (!sawInit) {
          pending = concat(pending, chunk);
          if (initSegmentEnd(pending) < 0) continue;
          sawInit = true;
          if (!this.buffer && !this.createBuffer(pending)) return;
          chunk = pending;
          pending = new Uint8Array(0);
        }
        if (!(await this.append(chunk, current))) return;
        while (current() && this.ahead() > MAX_AHEAD_S) await this.deps.delay(250);
        if (!current()) return;
      }
    } catch {
      if (current()) this.fail("The conversion stopped unexpectedly.");
      return;
    } finally {
      if (!current()) void reader.cancel().catch(() => {});
    }
    if (!sawInit) {
      this.fail("Glint couldn't convert this file.");
      return;
    }
    await this.idle();
    if (current() && this.source?.readyState === "open") {
      try {
        this.source.endOfStream();
      } catch {
        // Still updating; the element plays to the end of what it has.
      }
    }
  }

  private createBuffer(init: Uint8Array): boolean {
    const mime = mimeFor(init);
    const source = this.source;
    if (!mime || !source || source.readyState !== "open") {
      this.fail("Glint couldn't read the converted stream.");
      return false;
    }
    try {
      const buffer = source.addSourceBuffer(mime);
      buffer.mode = "segments";
      buffer.timestampOffset = -this.stream.timeOffset;
      this.buffer = buffer;
      return true;
    } catch {
      this.fail("This computer can't decode the video in this file.");
      return false;
    }
  }

  private async append(chunk: Uint8Array, current: () => boolean): Promise<boolean> {
    const buffer = this.buffer;
    if (!buffer) return false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.idle();
      if (!current()) return false;
      await this.evict(attempt > 0);
      if (!current()) return false;
      try {
        buffer.appendBuffer(chunk as Uint8Array<ArrayBuffer>);
        await this.idle();
        return true;
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") {
          if (current()) this.fail("The converted stream couldn't be played.");
          return false;
        }
        await this.deps.delay(500);
      }
    }
    if (current()) this.fail("Ran out of memory for this video.");
    return false;
  }

  /** Frees played media, and with `hard` everything outside the near window. */
  private async evict(hard: boolean): Promise<void> {
    const buffer = this.buffer;
    if (!buffer) return;
    const time = this.video.currentTime;
    const ranges = buffer.buffered;
    if (ranges.length === 0) return;
    const keepFrom = Math.max(0, time - (hard ? 5 : KEEP_BEHIND_S));
    const first = ranges.start(0);
    try {
      if (first < keepFrom - (hard ? 0 : 10) && keepFrom > 0) {
        buffer.remove(0, keepFrom);
        await this.idle();
      }
      if (hard) {
        const last = ranges.end(ranges.length - 1);
        const keepTo = time + MAX_AHEAD_S;
        if (last > keepTo) {
          buffer.remove(keepTo, Infinity);
          await this.idle();
        }
      }
    } catch {
      // Removal is best effort; the append that follows reports real trouble.
    }
  }

  private fail(message: string): void {
    if (this.disposed) return;
    this.generation += 1;
    this.controller?.abort();
    this.onFailure(message);
  }
}
