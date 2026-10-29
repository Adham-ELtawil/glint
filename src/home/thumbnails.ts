import type { LibraryApi, MediaInfo } from "./library";

/** What a card shows in its thumbnail slot. */
export type Thumb =
  | { kind: "image"; url: string; duration: number | null }
  | { kind: "fallback"; duration: number | null; missing: boolean };

export interface GrabbedFrame {
  dataUrl: string;
  duration: number;
}

/**
 * A frame grab that failed. `permanent` means the webview cannot decode the
 * file (wrong codec, no video track), so the failure is cached and not
 * retried. Timeouts and security errors may be transient and are not cached.
 */
export class GrabError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export type FrameGrabber = (url: string) => Promise<GrabbedFrame>;

/** Width of stored thumbnails. Cards are at most ~360px wide, so 2x covers HiDPI. */
export const THUMB_WIDTH = 480;
const GRAB_TIMEOUT_MS = 12_000;
const LOOKUP_DELAY_MS = 24;
const LOOKUP_BATCH = 100;

/**
 * Where to grab the thumbnail frame: about 10% in, which skips most intros
 * and black leaders, but never past the end of a very short clip.
 */
export function frameTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const target = duration * 0.1;
  const floor = Math.min(1, duration / 2);
  const ceiling = Math.max(0, duration - 0.25);
  return Math.min(ceiling, Math.max(floor, target));
}

/**
 * Loads thumbnails for home-screen cards. Cached thumbnails come from Rust
 * in batches; missing ones are grabbed from the video by the webview, a
 * couple at a time, then handed back to Rust to cache on disk.
 */
export class ThumbnailService {
  private readonly results = new Map<string, Promise<Thumb>>();
  private readonly infos = new Map<string, Promise<MediaInfo>>();
  private pending: { path: string; resolve: (info: MediaInfo) => void }[] = [];
  private lookupTimer = 0;
  private readonly jobs: (() => Promise<void>)[] = [];
  private active = 0;
  private disposed = false;

  constructor(
    private readonly api: LibraryApi,
    private readonly grab: FrameGrabber = grabFrame,
    private readonly concurrency = 2,
  ) {}

  /** File status plus any cached thumbnail, batched with other requests. */
  info(path: string): Promise<MediaInfo> {
    const known = this.infos.get(path);
    if (known) return known;
    const promise = new Promise<MediaInfo>((resolve) => {
      this.pending.push({ path, resolve });
      if (!this.lookupTimer) {
        this.lookupTimer = window.setTimeout(() => void this.flushLookups(), LOOKUP_DELAY_MS);
      }
    });
    this.infos.set(path, promise);
    return promise;
  }

  get(path: string): Promise<Thumb> {
    const known = this.results.get(path);
    if (known) return known;
    const promise = this.resolve(path);
    this.results.set(path, promise);
    return promise;
  }

  /** Forget what is known about these paths (or everything), e.g. after a rescan. */
  invalidate(paths?: string[]): void {
    if (!paths) {
      this.results.clear();
      this.infos.clear();
      return;
    }
    for (const path of paths) {
      this.results.delete(path);
      this.infos.delete(path);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.jobs.length = 0;
    window.clearTimeout(this.lookupTimer);
  }

  private async resolve(path: string): Promise<Thumb> {
    const info = await this.info(path);
    if (!info.exists) return { kind: "fallback", duration: null, missing: true };
    if (info.thumbnail) return { kind: "image", url: info.thumbnail, duration: info.duration };
    if (info.thumbnailFailed) return { kind: "fallback", duration: info.duration, missing: false };
    return this.schedule(() => this.generate(path));
  }

  private async generate(path: string): Promise<Thumb> {
    try {
      const frame = await this.grabAny(path);
      const duration =
        Number.isFinite(frame.duration) && frame.duration > 0 ? frame.duration : null;
      void this.api.saveThumbnail(path, frame.dataUrl, duration).catch(() => {});
      return { kind: "image", url: frame.dataUrl, duration };
    } catch (error) {
      if (error instanceof GrabError && error.permanent) {
        void this.api.saveThumbnail(path, null, null).catch(() => {});
      } else {
        // Try again next time the card is shown.
        queueMicrotask(() => this.results.delete(path));
      }
      return { kind: "fallback", duration: null, missing: false };
    }
  }

  /** The webview first (fast, no extra process), then Glint's ffmpeg for other formats. */
  private async grabAny(path: string): Promise<GrabbedFrame> {
    try {
      const url = await this.api.mediaUrl(path);
      return await this.grab(url);
    } catch (error) {
      const ffmpegFrame = this.api.ffmpegFrame;
      if (!(error instanceof GrabError) || !error.permanent || !ffmpegFrame) throw error;
      try {
        return await ffmpegFrame.call(this.api, path);
      } catch {
        throw new GrabError("Neither the webview nor ffmpeg could read this file.", true);
      }
    }
  }

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push(async () => {
        try {
          resolve(await task());
        } catch (error) {
          reject(error);
        }
      });
      this.pump();
    });
  }

  private pump(): void {
    while (!this.disposed && this.active < this.concurrency && this.jobs.length > 0) {
      const job = this.jobs.shift()!;
      this.active += 1;
      void job().finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  private async flushLookups(): Promise<void> {
    this.lookupTimer = 0;
    const batch = this.pending.splice(0, LOOKUP_BATCH);
    if (this.pending.length > 0) {
      this.lookupTimer = window.setTimeout(() => void this.flushLookups(), 0);
    }
    if (batch.length === 0) return;
    let infos: MediaInfo[] = [];
    try {
      infos = await this.api.mediaInfo(batch.map((item) => item.path));
    } catch {
      infos = [];
    }
    const byPath = new Map(infos.map((info) => [info.path, info]));
    for (const item of batch) {
      const info = byPath.get(item.path);
      if (info) {
        item.resolve(info);
      } else {
        // Unknown: assume present so the card stays usable, and look again later.
        this.infos.delete(item.path);
        item.resolve({
          path: item.path,
          exists: true,
          size: 0,
          modifiedMs: 0,
          thumbnail: null,
          thumbnailFailed: true,
          duration: null,
        });
      }
    }
  }
}

/**
 * Grab one frame with a hidden `<video>`, the same decoder the player uses,
 * so nothing extra ships with Glint. The loopback server answers with CORS
 * headers, which keeps the canvas readable.
 */
export function grabFrame(url: string): Promise<GrabbedFrame> {
  return new Promise<GrabbedFrame>((resolve, reject) => {
    const host = grabberHost();
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    host.append(video);

    let settled = false;
    let triedLater = false;
    const finish = (result: GrabbedFrame | GrabError) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      video.remove();
      if (result instanceof GrabError) reject(result);
      else resolve(result);
    };
    const timer = window.setTimeout(
      () => finish(new GrabError("Timed out reading a frame.", false)),
      GRAB_TIMEOUT_MS,
    );

    video.addEventListener("error", () => {
      const code = video.error?.code ?? 0;
      // 3 = decode, 4 = format not supported. Network errors may be transient.
      finish(new GrabError("The webview can't decode this file.", code === 3 || code === 4));
    });
    video.addEventListener("loadedmetadata", () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(new GrabError("No video track.", true));
        return;
      }
      video.currentTime = frameTime(video.duration);
    });
    video.addEventListener("seeked", () => {
      afterPaint(video, () => {
        try {
          const canvas = drawFrame(video);
          if (!triedLater && isMostlyDark(canvas) && Number.isFinite(video.duration)) {
            // Fades and black title cards: look a little further in once.
            triedLater = true;
            const later = Math.min(Math.max(0, video.duration - 0.25), video.duration * 0.3);
            if (later > video.currentTime + 0.5) {
              video.currentTime = later;
              return;
            }
          }
          finish({ dataUrl: canvas.toDataURL("image/jpeg", 0.82), duration: video.duration });
        } catch {
          finish(new GrabError("Couldn't read the frame.", false));
        }
      });
    });
    video.src = url;
  });
}

function afterPaint(video: HTMLVideoElement, run: () => void): void {
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
  };
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };
  if (typeof withCallback.requestVideoFrameCallback === "function") {
    withCallback.requestVideoFrameCallback(once);
  }
  // A paused, detached-looking element may never present a frame; the
  // seeked frame is already decoded by now, so fall back after a beat.
  window.setTimeout(once, 120);
}

function drawFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const width = Math.min(THUMB_WIDTH, video.videoWidth);
  const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas.");
  context.imageSmoothingQuality = "high";
  context.drawImage(video, 0, 0, width, height);
  return canvas;
}

function isMostlyDark(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = 32;
  probe.height = 18;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(canvas, 0, 0, probe.width, probe.height);
  const { data } = context.getImageData(0, 0, probe.width, probe.height);
  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;
  }
  return total / (data.length / 4) < 14;
}

let host: HTMLElement | null = null;

/** Off-screen parking spot so the grabber's video is attached but invisible. */
function grabberHost(): HTMLElement {
  if (host?.isConnected) return host;
  host = document.createElement("div");
  host.className = "thumb-grabber";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  return host;
}
