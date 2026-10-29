// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { LibraryApi, MediaInfo } from "../src/home/library";
import { frameTime, GrabError, ThumbnailService } from "../src/home/thumbnails";

function fakeApi(infos: Record<string, Partial<MediaInfo>>) {
  const calls = {
    lookups: [] as string[][],
    saved: [] as [string, string | null, number | null][],
    urls: [] as string[],
  };
  const api: LibraryApi = {
    available: true,
    folders: async () => [],
    addFolder: async () => [],
    removeFolder: async () => [],
    pickFolder: async () => null,
    scan: async () => [],
    mediaInfo: async (paths) => {
      calls.lookups.push(paths);
      return paths.map((path) => ({
        path,
        exists: true,
        size: 1,
        modifiedMs: 1,
        thumbnail: null,
        thumbnailFailed: false,
        duration: null,
        ...infos[path],
      }));
    },
    saveThumbnail: async (path, data, duration) => void calls.saved.push([path, data, duration]),
    mediaUrl: async (path) => {
      calls.urls.push(path);
      return `http://127.0.0.1:1/${encodeURIComponent(path)}`;
    },
  };
  return { api, calls };
}

describe("thumbnail frame time", () => {
  it("grabs about 10% in, clamped for short and long clips", () => {
    expect(frameTime(100)).toBe(10);
    expect(frameTime(5)).toBe(1);
    expect(frameTime(1)).toBe(0.5);
    expect(frameTime(0.2)).toBe(0);
    expect(frameTime(Number.NaN)).toBe(0);
    expect(frameTime(7200)).toBe(720);
  });
});

describe("thumbnail service", () => {
  it("batches lookups and serves cached thumbnails without grabbing", async () => {
    const { api, calls } = fakeApi({
      "/a.mp4": { thumbnail: "data:image/jpeg;base64,AA", duration: 12 },
    });
    const grab = vi.fn();
    const service = new ThumbnailService(api, grab);
    const [a, b] = await Promise.all([
      service.get("/a.mp4"),
      service.get("/b.mp4"),
      service.get("/a.mp4"),
    ]);
    expect(calls.lookups).toEqual([["/a.mp4", "/b.mp4"]]);
    expect(a).toEqual({ kind: "image", url: "data:image/jpeg;base64,AA", duration: 12 });
    expect(b.kind).toBe("fallback");
    expect(grab).not.toHaveBeenCalledWith(expect.stringContaining("a.mp4"));
  });

  it("grabs missing thumbnails and saves them", async () => {
    const { api, calls } = fakeApi({});
    const grab = vi.fn(async () => ({ dataUrl: "data:image/jpeg;base64,BB", duration: 30 }));
    const service = new ThumbnailService(api, grab);
    expect(await service.get("/new.mp4")).toEqual({
      kind: "image",
      url: "data:image/jpeg;base64,BB",
      duration: 30,
    });
    await Promise.resolve();
    expect(calls.saved).toEqual([["/new.mp4", "data:image/jpeg;base64,BB", 30]]);
  });

  it("reports missing files without grabbing", async () => {
    const { api, calls } = fakeApi({ "/gone.mp4": { exists: false } });
    const service = new ThumbnailService(api, vi.fn());
    expect(await service.get("/gone.mp4")).toEqual({
      kind: "fallback",
      duration: null,
      missing: true,
    });
    expect(calls.urls).toEqual([]);
  });

  it("caches permanent failures and retries transient ones", async () => {
    const { api, calls } = fakeApi({ "/known-bad.avi": { thumbnailFailed: true, duration: 9 } });
    let attempt = 0;
    const grab = vi.fn(async (url: string) => {
      attempt++;
      if (url.includes("codec")) throw new GrabError("no decoder", true);
      if (attempt < 3) throw new GrabError("timeout", false);
      return { dataUrl: "data:image/jpeg;base64,CC", duration: 5 };
    });
    const service = new ThumbnailService(api, grab);
    expect(await service.get("/known-bad.avi")).toEqual({
      kind: "fallback",
      duration: 9,
      missing: false,
    });
    expect(await service.get("/codec.wmv")).toMatchObject({ kind: "fallback" });
    await Promise.resolve();
    expect(calls.saved).toContainEqual(["/codec.wmv", null, null]);

    expect((await service.get("/flaky.mp4")).kind).toBe("fallback");
    await Promise.resolve();
    expect((await service.get("/flaky.mp4")).kind).toBe("image");
    expect(calls.saved.filter(([p]) => p === "/flaky.mp4")).toHaveLength(1);
  });

  it("runs at most two grabs at a time", async () => {
    const { api } = fakeApi({});
    let running = 0;
    let peak = 0;
    const grab = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { dataUrl: "data:image/jpeg;base64,DD", duration: 1 };
    };
    const service = new ThumbnailService(api, grab);
    await Promise.all(["/1", "/2", "/3", "/4", "/5"].map((p) => service.get(`${p}.mp4`)));
    expect(peak).toBe(2);
  });

  it("forgets results on invalidate", async () => {
    const { api, calls } = fakeApi({});
    const service = new ThumbnailService(api, async () => ({ dataUrl: "data:,", duration: 1 }));
    await service.get("/a.mp4");
    service.invalidate(["/a.mp4"]);
    await service.get("/a.mp4");
    expect(calls.lookups).toHaveLength(2);
  });

  it("asks ffmpeg for frames the webview can't decode", async () => {
    const { api, calls } = fakeApi({});
    const ffmpegFrame = vi.fn(async (path: string) => ({
      dataUrl: `data:image/jpeg;base64,${path.endsWith(".mkv") ? "MK" : "??"}`,
      duration: 61,
    }));
    const service = new ThumbnailService({ ...api, ffmpegFrame }, async () => {
      throw new GrabError("no decoder", true);
    });
    expect(await service.get("/v/a.mkv")).toEqual({
      kind: "image",
      url: "data:image/jpeg;base64,MK",
      duration: 61,
    });
    await Promise.resolve();
    expect(ffmpegFrame).toHaveBeenCalledWith("/v/a.mkv");
    expect(calls.saved).toEqual([["/v/a.mkv", "data:image/jpeg;base64,MK", 61]]);
  });

  it("remembers files neither the webview nor ffmpeg can read", async () => {
    const { api, calls } = fakeApi({});
    const ffmpegFrame = vi.fn(async () => {
      throw new Error("ffmpeg failed");
    });
    const transient = vi.fn(async () => {
      throw new GrabError("timeout", false);
    });
    const broken = new ThumbnailService({ ...api, ffmpegFrame }, async () => {
      throw new GrabError("no decoder", true);
    });
    expect((await broken.get("/v/bad.avi")).kind).toBe("fallback");
    await Promise.resolve();
    expect(calls.saved).toEqual([["/v/bad.avi", null, null]]);
    // A timeout isn't a decode failure, so ffmpeg isn't asked.
    await new ThumbnailService({ ...api, ffmpegFrame }, transient).get("/v/slow.mp4");
    expect(ffmpegFrame).toHaveBeenCalledTimes(1);
  });
});
