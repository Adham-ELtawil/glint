import type { MediaSource } from "../model/media";

/**
 * Frames for the seek-bar preview, YouTube style.
 *
 * - Files the webview plays itself: a hidden, muted second `<video>` on the
 *   same loopback URL seeks to the hovered time and is drawn to a canvas.
 * - Files streamed through Glint's ffmpeg: the media server's `/frame/<token>`
 *   route returns a small JPEG (the stream URL with `/frame/` for `/stream/`).
 * - Audio-only files, unsupported files, and any source that fails: no frame,
 *   so the tooltip shows only the time.
 *
 * Hover times are rounded to buckets so nearby positions share a frame, frames
 * are cached (least recently used goes first), only one is made at a time,
 * and while one is being made only the latest request waits (latest wins).
 */

export type PreviewPlan = { kind: "video"; url: string } | { kind: "frame"; base: string } | null;

/** Width the frames are drawn at, in pixels (shown at 160 CSS px). */
export const PREVIEW_WIDTH = 240;
/** Frames kept per file. */
export const PREVIEW_CACHE_SIZE = 120;
/** Minimum time between two frame requests. */
export const PREVIEW_THROTTLE_MS = 120;
/** A native seek that never finishes is given up after this long. */
const SEEK_TIMEOUT_MS = 4000;

/** `/stream/<token>` → `/frame/<token>`; null for anything else. */
export function frameUrlFor(streamUrl: string): string | null {
  const url = streamUrl.split("?")[0];
  if (!/\/stream\/[^/]+$/.test(url)) return null;
  return url.replace(/\/stream\/([^/]+)$/, "/frame/$1");
}

/** How (and whether) a source gets previews. */
export function previewPlanFor(source: MediaSource | null | undefined): PreviewPlan {
  if (!source || source.unsupported) return null;
  if (source.stream) {
    if (!source.stream.hasVideo) return null;
    const base = frameUrlFor(source.stream.url);
    return base ? { kind: "frame", base } : null;
  }
  return source.url ? { kind: "video", url: source.url } : null;
}

/** Bucket length in seconds: at least 1 s, about 300 buckets per file. */
export function bucketSize(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(1, duration / 300);
}

/** The time a hover position is previewed at: the middle of its bucket. */
export function bucketTime(time: number, duration: number): number {
  const size = bucketSize(duration);
  const index = Math.floor(Math.max(0, time) / size);
  const middle = index * size + size / 2;
  const end = Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - 0.1) : middle;
  return Math.round(Math.min(middle, end) * 1000) / 1000;
}

/** A small least-recently-used map that tells you what it dropped. */
export class FrameCache {
  private readonly map = new Map<number, string>();

  constructor(
    private readonly limit: number,
    private readonly onEvict: (url: string) => void = () => {},
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: number): string | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: number, value: string): void {
    const old = this.map.get(key);
    if (old !== undefined && old !== value) this.onEvict(old);
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const [oldest, url] = this.map.entries().next().value as [number, string];
      this.map.delete(oldest);
      this.onEvict(url);
    }
  }

  clear(): void {
    for (const url of this.map.values()) this.onEvict(url);
    this.map.clear();
  }
}

export interface SeekPreviewOptions {
  /** Called with a frame's image URL, or null when there is nothing to show. */
  onFrame: (url: string | null) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

export class SeekPreview {
  private plan: PreviewPlan = null;
  private generation = 0;
  private busy = false;
  private pending: number | null = null;
  private lastStart = -Infinity;
  private throttle = 0;
  private failed = false;
  private wanted: number | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly cache: FrameCache;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => number;
  private readonly clearTimer: (id: number) => void;

  constructor(private readonly options: SeekPreviewOptions) {
    this.cache = new FrameCache(PREVIEW_CACHE_SIZE, (url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => performance.now());
    this.setTimer = options.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));
  }

  /** True when this source can show frames (so the view can reserve the box). */
  get available(): boolean {
    return this.plan != null && !this.failed;
  }

  setSource(source: MediaSource | null): void {
    const plan = previewPlanFor(source);
    if (samePlan(plan, this.plan)) return;
    this.reset();
    this.plan = plan;
  }

  /** Asks for the frame at `time`. Cached frames are shown at once. */
  request(time: number, duration: number): void {
    if (!this.available || !Number.isFinite(duration) || duration <= 0) return;
    const at = bucketTime(time, duration);
    this.wanted = at;
    const hit = this.cache.get(at);
    if (hit) {
      this.pending = null;
      this.options.onFrame(hit);
      return;
    }
    this.pending = at;
    this.pump();
  }

  /** The tooltip closed: drop any waiting request. */
  cancel(): void {
    this.pending = null;
    this.wanted = null;
    this.clearTimer(this.throttle);
    this.throttle = 0;
  }

  destroy(): void {
    this.reset();
  }

  private reset(): void {
    this.generation++;
    this.cancel();
    this.busy = false;
    this.failed = false;
    this.lastStart = -Infinity;
    this.cache.clear();
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
      this.video = null;
    }
    this.plan = null;
  }

  private pump(): void {
    if (this.busy || this.pending == null || this.failed) return;
    const wait = this.lastStart + PREVIEW_THROTTLE_MS - this.now();
    if (wait > 0) {
      if (!this.throttle) {
        this.throttle = this.setTimer(() => {
          this.throttle = 0;
          this.pump();
        }, wait);
      }
      return;
    }
    const at = this.pending;
    this.pending = null;
    this.busy = true;
    this.lastStart = this.now();
    const generation = this.generation;
    void this.make(at).then(
      (url) => {
        if (generation !== this.generation) {
          if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        this.busy = false;
        if (url) {
          this.cache.set(at, url);
          if (this.wanted === at) this.options.onFrame(url);
        } else if (this.failed) {
          this.options.onFrame(null);
        }
        this.pump();
      },
      () => {
        if (generation !== this.generation) return;
        this.busy = false;
        this.pump();
      },
    );
  }

  private async make(at: number): Promise<string | null> {
    const plan = this.plan;
    if (!plan) return null;
    if (plan.kind === "frame") {
      const response = await this.fetchImpl(`${plan.base}?t=${at}`);
      if (!response.ok) return null;
      const blob = await response.blob();
      if (blob.size === 0) return null;
      return URL.createObjectURL(blob);
    }
    return this.grab(plan.url, at);
  }

  /** Seeks the hidden video and draws the frame. */
  private grab(url: string, at: number): Promise<string | null> {
    const video = this.video ?? this.createVideo(url);
    return new Promise((resolve) => {
      let timer = 0;
      const finish = (result: string | null) => {
        this.clearTimer(timer);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        resolve(result);
      };
      const onSeeked = () => finish(this.draw(video));
      const onError = () => {
        this.failed = true;
        finish(null);
      };
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      timer = this.setTimer(() => finish(null), SEEK_TIMEOUT_MS);
      try {
        video.currentTime = at;
      } catch {
        finish(null);
      }
    });
  }

  private createVideo(url: string): HTMLVideoElement {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.playsInline = true;
    video.src = url;
    this.video = video;
    return video;
  }

  private draw(video: HTMLVideoElement): string | null {
    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = this.canvas ?? (this.canvas = document.createElement("canvas"));
    canvas.width = PREVIEW_WIDTH;
    canvas.height = Math.max(2, Math.round((PREVIEW_WIDTH * video.videoHeight) / video.videoWidth));
    const context = canvas.getContext("2d");
    if (!context) return null;
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      // A tainted canvas (no CORS) or a decoder hiccup: no preview for this file.
      this.failed = true;
      return null;
    }
  }
}

function samePlan(a: PreviewPlan, b: PreviewPlan): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "video" && b.kind === "video") return a.url === b.url;
  if (a.kind === "frame" && b.kind === "frame") return a.base === b.base;
  return false;
}
