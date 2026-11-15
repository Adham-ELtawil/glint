// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaSource as Source } from "../src/model/media";
import {
  bucketSize,
  bucketTime,
  FrameCache,
  frameUrlFor,
  PREVIEW_THROTTLE_MS,
  previewPlanFor,
  SeekPreview,
} from "../src/player/seek-preview";

const native: Source = {
  id: "/v/a.mp4",
  path: "/v/a.mp4",
  url: "http://127.0.0.1:5000/media/abc",
  filename: "a.mp4",
  extension: "mp4",
};
const stream = (hasVideo: boolean): Source => ({
  ...native,
  id: "/v/b.mkv",
  stream: {
    url: "http://127.0.0.1:5000/stream/tok1",
    mode: "remux",
    duration: 100,
    timeOffset: 10,
    hasVideo,
  },
});

describe("preview plan", () => {
  it("uses the hidden video, the frame route, or nothing", () => {
    expect(previewPlanFor(native)).toEqual({ kind: "video", url: native.url });
    expect(previewPlanFor(stream(true))).toEqual({
      kind: "frame",
      base: "http://127.0.0.1:5000/frame/tok1",
    });
    expect(previewPlanFor(stream(false))).toBeNull();
    expect(previewPlanFor({ ...native, unsupported: { kind: "audio", codec: "x" } })).toBeNull();
    expect(previewPlanFor(null)).toBeNull();
  });

  it("derives frame URLs only from stream URLs", () => {
    expect(frameUrlFor("http://127.0.0.1:1/stream/abc?t=5")).toBe("http://127.0.0.1:1/frame/abc");
    expect(frameUrlFor("http://127.0.0.1:1/media/abc")).toBeNull();
  });

  it("rounds hover times into buckets", () => {
    expect(bucketSize(60)).toBe(1);
    expect(bucketSize(3000)).toBe(10);
    expect(bucketTime(12.3, 60)).toBe(12.5);
    expect(bucketTime(12.9, 60)).toBe(12.5);
    expect(bucketTime(-4, 60)).toBe(0.5);
    expect(bucketTime(59.99, 60)).toBe(59.5);
    expect(bucketTime(1234, 3000)).toBe(1235);
    expect(bucketTime(0.2, 0.5)).toBe(0.4);
  });
});

describe("FrameCache", () => {
  it("drops the least recently used frame and reports it", () => {
    const evicted: string[] = [];
    const cache = new FrameCache(2, (url) => evicted.push(url));
    cache.set(1, "a");
    cache.set(2, "b");
    expect(cache.get(1)).toBe("a");
    cache.set(3, "c");
    expect(evicted).toEqual(["b"]);
    expect(cache.get(2)).toBeUndefined();
    cache.clear();
    expect(evicted).toEqual(["b", "a", "c"]);
    expect(cache.size).toBe(0);
  });
});

describe("SeekPreview with the frame route", () => {
  let clock = 0;
  let timers: { fn: () => void; at: number; id: number }[] = [];
  let urls = 0;
  const revoked: string[] = [];

  beforeEach(() => {
    clock = 1000;
    timers = [];
    urls = 0;
    revoked.length = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:frame-${++urls}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => void revoked.push(url));
  });
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const requests: { url: string; resolve: (ok: boolean) => void }[] = [];
    const frames: Array<string | null> = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          requests.push({
            url: String(input),
            resolve: (ok) =>
              resolve(new Response(ok ? new Blob(["jpg"]) : null, { status: ok ? 200 : 500 })),
          });
        }),
    ) as unknown as typeof fetch;
    const preview = new SeekPreview({
      onFrame: (url) => frames.push(url),
      fetchImpl,
      now: () => clock,
      setTimer: (fn, ms) => {
        const id = timers.length + 1;
        timers.push({ fn, at: clock + ms, id });
        return id;
      },
      clearTimer: (id) => {
        timers = timers.filter((t) => t.id !== id);
      },
    });
    preview.setSource(stream(true));
    const settle = () => new Promise((r) => setTimeout(r, 0));
    const tick = (ms: number) => {
      clock += ms;
      for (const t of timers.filter((t) => t.at <= clock)) {
        timers = timers.filter((x) => x !== t);
        t.fn();
      }
    };
    return { preview, requests, frames, settle, tick };
  }

  it("makes one frame at a time, latest request wins, then caches", async () => {
    const { preview, requests, frames, settle, tick } = setup();
    expect(preview.available).toBe(true);
    preview.request(10.2, 100);
    preview.request(20.2, 100);
    preview.request(30.2, 100);
    expect(requests.map((r) => r.url)).toEqual(["http://127.0.0.1:5000/frame/tok1?t=10.5"]);
    requests[0].resolve(true);
    await settle();
    await settle();
    // The 10 s frame is cached but not shown: the pointer has moved on.
    expect(frames).toEqual([]);
    tick(PREVIEW_THROTTLE_MS);
    expect(requests.map((r) => r.url)).toHaveLength(2);
    expect(requests[1].url).toBe("http://127.0.0.1:5000/frame/tok1?t=30.5");
    requests[1].resolve(true);
    await settle();
    await settle();
    expect(frames).toEqual(["blob:frame-2"]);
    preview.request(10.9, 100);
    expect(frames).toEqual(["blob:frame-2", "blob:frame-1"]);
    expect(requests).toHaveLength(2);
  });

  it("revokes frames when the file changes and ignores late answers", async () => {
    const { preview, requests, settle } = setup();
    preview.request(5, 100);
    requests[0].resolve(true);
    await settle();
    await settle();
    preview.request(50, 100);
    preview.setSource(native);
    expect(revoked).toEqual(["blob:frame-1"]);
    clock += 1000;
    requests[1]?.resolve(true);
    await settle();
    await settle();
    preview.setSource(null);
    expect(preview.available).toBe(false);
  });

  it("does nothing for audio-only files or without a duration", () => {
    const { preview, requests } = setup();
    preview.request(5, 0);
    expect(requests).toHaveLength(0);
    preview.setSource(stream(false));
    preview.request(5, 100);
    expect(requests).toHaveLength(0);
    expect(preview.available).toBe(false);
  });
});
