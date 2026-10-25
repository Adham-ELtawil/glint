import { describe, expect, it } from "vitest";
import { badgeTime, extensionLabel, fileSize, relativeTime, titleOf } from "../src/home/format";
import {
  basename,
  createHistoryStore,
  HISTORY_STORAGE_KEY,
  MAX_HISTORY,
  parentName,
  watchedRatio,
} from "../src/home/history-store";
import { collapsedCount, columnsFor, gutterFor, MAX_COLUMNS } from "../src/home/layout";
import { buildHomeModel, pathKey, samePath } from "../src/home/model";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const item = (n: number) => ({ id: `/v/${n}.mp4`, path: `/v/${n}.mp4`, filename: `${n}.mp4` });

describe("watch history", () => {
  it("orders entries by when they were last watched", () => {
    const store = createHistoryStore(memoryStorage());
    store.record(item(1), 1000);
    store.record(item(2), 2000);
    store.record(item(1), 3000);
    expect(store.list().map((e) => e.id)).toEqual(["/v/1.mp4", "/v/2.mp4"]);
  });

  it("keeps position and duration when a file is opened again", () => {
    const store = createHistoryStore(memoryStorage());
    store.record(item(1), 1000);
    store.progress("/v/1.mp4", 42, 120, 2000);
    store.record(item(1), 5000);
    expect(store.get("/v/1.mp4")).toMatchObject({ position: 42, duration: 120, watchedAt: 5000 });
  });

  it("ignores progress for files that are not in history", () => {
    const store = createHistoryStore(memoryStorage());
    store.progress("/v/nope.mp4", 10, 100, 1000);
    expect(store.list()).toEqual([]);
  });

  it("keeps the last known duration when playback reports none", () => {
    const store = createHistoryStore(memoryStorage());
    store.record(item(1), 1000);
    store.progress("/v/1.mp4", 10, 300, 2000);
    store.progress("/v/1.mp4", 20, Number.NaN, 4000);
    expect(store.get("/v/1.mp4")).toMatchObject({ position: 20, duration: 300 });
  });

  it("caps the list at MAX_HISTORY, dropping the oldest", () => {
    const store = createHistoryStore(memoryStorage());
    for (let n = 0; n < MAX_HISTORY + 5; n++) store.record(item(n), 1000 + n);
    expect(store.list()).toHaveLength(MAX_HISTORY);
    expect(store.get("/v/0.mp4")).toBeNull();
    expect(store.list()[0]!.id).toBe(`/v/${MAX_HISTORY + 4}.mp4`);
  });

  it("persists, removes, restores and clears", () => {
    const storage = memoryStorage();
    const store = createHistoryStore(storage);
    store.record(item(1), 1000);
    store.record(item(2), 2000);
    expect(createHistoryStore(storage).list()).toHaveLength(2);
    const removed = store.get("/v/1.mp4")!;
    store.remove("/v/1.mp4");
    expect(createHistoryStore(storage).get("/v/1.mp4")).toBeNull();
    store.restore(removed);
    expect(store.list().map((e) => e.id)).toEqual(["/v/2.mp4", "/v/1.mp4"]);
    store.clear();
    expect(store.list()).toEqual([]);
    expect(storage.data.has(HISTORY_STORAGE_KEY)).toBe(false);
  });

  it("notifies subscribers until they unsubscribe", () => {
    const store = createHistoryStore(memoryStorage());
    let calls = 0;
    const stop = store.subscribe(() => calls++);
    store.record(item(1), 1000);
    stop();
    store.record(item(2), 2000);
    expect(calls).toBe(1);
  });

  it("drops corrupt, duplicate and incomplete stored entries", () => {
    const raw = JSON.stringify([
      { id: "/a.mp4", path: "/a.mp4", filename: "a.mp4", position: 5, duration: 10, watchedAt: 2 },
      { id: "/a.mp4", path: "/a.mp4", position: 1, watchedAt: 1 },
      { id: "", path: "/b.mp4" },
      { id: "/c.mkv", path: "/x/c.mkv", position: -3, duration: "long", watchedAt: 3 },
      "junk",
      null,
    ]);
    const store = createHistoryStore(memoryStorage({ [HISTORY_STORAGE_KEY]: raw }));
    expect(store.list()).toEqual([
      { id: "/c.mkv", path: "/x/c.mkv", filename: "c.mkv", position: 0, duration: 0, watchedAt: 3 },
      { id: "/a.mp4", path: "/a.mp4", filename: "a.mp4", position: 5, duration: 10, watchedAt: 2 },
    ]);
    expect(
      createHistoryStore(memoryStorage({ [HISTORY_STORAGE_KEY]: "{not json" })).list(),
    ).toEqual([]);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {},
    };
    const store = createHistoryStore(broken);
    expect(() => store.record(item(1), 1)).not.toThrow();
    expect(store.list()).toHaveLength(1);
  });
});

describe("history helpers", () => {
  it("counts the last 10 seconds as fully watched", () => {
    expect(watchedRatio(0, 100)).toBe(0);
    expect(watchedRatio(25, 100)).toBe(0.25);
    expect(watchedRatio(91, 100)).toBe(1);
    expect(watchedRatio(10, 0)).toBe(0);
    expect(watchedRatio(Number.NaN, 100)).toBe(0);
  });

  it("splits Windows and POSIX paths", () => {
    expect(basename("C:\\Users\\me\\Videos\\clip.mp4")).toBe("clip.mp4");
    expect(parentName("C:\\Users\\me\\Videos\\clip.mp4")).toBe("Videos");
    expect(parentName("/home/me/Movies/a.mkv")).toBe("Movies");
    expect(parentName("clip.mp4")).toBe("");
  });
});

describe("card text", () => {
  const now = Date.UTC(2026, 9, 25, 12);
  it("formats relative times like YouTube", () => {
    expect(relativeTime(now - 20_000, now)).toBe("Just now");
    expect(relativeTime(now - 60_000, now)).toBe("1 minute ago");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("3 hours ago");
    expect(relativeTime(now - 30 * 3600_000, now)).toBe("Yesterday");
    expect(relativeTime(now - 3 * 86400_000, now)).toBe("3 days ago");
    expect(relativeTime(now - 15 * 86400_000, now)).toBe("2 weeks ago");
    expect(relativeTime(now - 65 * 86400_000, now)).toBe("2 months ago");
    expect(relativeTime(now - 800 * 86400_000, now)).toBe("2 years ago");
    expect(relativeTime(now + 5000, now)).toBe("Just now");
    expect(relativeTime(0, now)).toBe("");
  });

  it("formats duration badges", () => {
    expect(badgeTime(42)).toBe("0:42");
    expect(badgeTime(725.4)).toBe("12:05");
    expect(badgeTime(3729)).toBe("1:02:09");
    expect(badgeTime(0)).toBe("");
    expect(badgeTime(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("formats sizes in decimal units", () => {
    expect(fileSize(512)).toBe("512 bytes");
    expect(fileSize(980_000)).toBe("980 KB");
    expect(fileSize(1_250_000)).toBe("1.3 MB");
    expect(fileSize(14_000_000)).toBe("14 MB");
    expect(fileSize(1_200_000_000)).toBe("1.2 GB");
    expect(fileSize(0)).toBe("");
  });

  it("derives titles and extension labels", () => {
    expect(titleOf("Lecture 03.final.mp4")).toBe("Lecture 03.final");
    expect(titleOf(".hidden")).toBe(".hidden");
    expect(extensionLabel("clip.webm")).toBe("WEBM");
    expect(extensionLabel("noext")).toBe("VIDEO");
  });
});

describe("home grid", () => {
  it("fits as many 250px cards as the width allows, up to six", () => {
    expect(columnsFor(0)).toBe(1);
    expect(columnsFor(249)).toBe(1);
    expect(columnsFor(516)).toBe(2);
    expect(columnsFor(515)).toBe(1);
    expect(columnsFor(1216)).toBe(4);
    expect(columnsFor(5000)).toBe(MAX_COLUMNS);
  });

  it("collapses to two rows and tightens gutters on narrow windows", () => {
    expect(collapsedCount(4)).toBe(8);
    expect(collapsedCount(0)).toBe(2);
    expect(gutterFor(640)).toBe(16);
    expect(gutterFor(900)).toBe(24);
    expect(gutterFor(1280)).toBe(32);
  });
});

describe("path matching", () => {
  it("folds Windows verbatim prefixes, slashes and case", () => {
    expect(pathKey("\\\\?\\C:\\Users\\Me\\Videos\\A.mp4")).toBe("c:\\users\\me\\videos\\a.mp4");
    expect(samePath("\\\\?\\C:\\Videos\\A.mp4", "c:/videos/a.MP4")).toBe(true);
    expect(pathKey("\\\\?\\UNC\\nas\\share\\x.mp4")).toBe("\\\\nas\\share\\x.mp4");
    expect(samePath("C:\\Videos\\", "C:\\Videos")).toBe(true);
  });

  it("keeps POSIX paths case-sensitive", () => {
    expect(samePath("/home/me/A.mp4", "/home/me/a.mp4")).toBe(false);
    expect(samePath("/home/me/dir/", "/home/me/dir")).toBe(true);
  });

  it("joins history, availability and scans into the home model", () => {
    const folder = { path: "C:\\Users\\me\\Videos", name: "Videos", isDefault: true, exists: true };
    const gone = { path: "D:\\Old", name: "Old", isDefault: false, exists: true };
    const video = {
      path: "C:\\Users\\me\\Videos\\a.mp4",
      filename: "a.mp4",
      subfolder: "",
      size: 1,
      modifiedMs: 1,
    };
    const entry = {
      id: "x",
      path: "\\\\?\\C:\\Users\\me\\Videos\\A.mp4",
      filename: "A.mp4",
      position: 1,
      duration: 2,
      watchedAt: 3,
    };
    const missing = { ...entry, id: "y", path: "C:\\gone.mp4" };
    const model = buildHomeModel({
      native: true,
      history: [entry, missing],
      availability: new Map([["c:\\gone.mp4", false]]),
      folders: [folder, gone],
      scans: [
        {
          path: "\\\\?\\C:\\Users\\me\\Videos",
          name: "Videos",
          exists: true,
          truncated: true,
          videos: [video],
        },
        { path: "D:\\Old", name: "Old", exists: false, truncated: false, videos: [] },
      ],
      scanning: false,
    });
    expect(model.history.map((h) => h.available)).toEqual([true, false]);
    expect(model.sections[0]).toMatchObject({ videos: [video], truncated: true });
    expect(model.sections[1]!.folder.exists).toBe(false);
  });
});
