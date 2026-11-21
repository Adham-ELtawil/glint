import { describe, expect, it, vi } from "vitest";
import {
  TAGS_STORAGE_KEY,
  createTagStore,
  mergeTags,
  normalizeTag,
  parseTagInput,
  suggestTags,
  tagKey,
} from "../src/home/tags";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("normalizeTag", () => {
  it("trims, collapses spaces and drops a leading #", () => {
    expect(normalizeTag("  #Snow   Trip ")).toBe("Snow Trip");
    expect(normalizeTag("###")).toBe("");
    expect(normalizeTag("   ")).toBe("");
  });

  it("caps very long tags", () => {
    expect(normalizeTag("a".repeat(80))).toHaveLength(32);
  });

  it("compares case- and width-insensitively", () => {
    expect(tagKey("Family")).toBe(tagKey("FAMILY"));
    expect(tagKey("ＴＲＩＰ")).toBe(tagKey("trip"));
  });
});

describe("parseTagInput", () => {
  it("splits on commas, including the Arabic comma, and dedupes", () => {
    expect(parseTagInput("Snowboarding, Trip,family, trip ,, ")).toEqual([
      "Snowboarding",
      "Trip",
      "family",
    ]);
    expect(parseTagInput("رحلة، عائلة")).toEqual(["رحلة", "عائلة"]);
  });
});

describe("mergeTags", () => {
  it("keeps the first spelling of a tag", () => {
    expect(mergeTags(["Trip"], ["trip", "Family"])).toEqual(["Trip", "Family"]);
  });
});

describe("suggestTags", () => {
  it("picks the meaningful words of the issue's example", () => {
    expect(suggestTags("Snowboard trip with the family.mp4")).toEqual([
      "Snowboard",
      "Trip",
      "Family",
    ]);
  });

  it("drops release junk, numbers and the extension", () => {
    expect(suggestTags("The.Grand.Budapest.Hotel.2014.1080p.BluRay.x264-YIFY.mkv")).toEqual([
      "Grand",
      "Budapest",
      "Hotel",
    ]);
    expect(suggestTags("Show.Name.S01E02.720p.WEBRip.HEVC.AAC.mkv")).toEqual(["Show", "Name"]);
    expect(suggestTags("VID_20240101_123456.mp4")).toEqual([]);
    expect(suggestTags("GOPR0042.MP4")).toEqual([]);
  });

  it("splits camelCase and separators", () => {
    expect(suggestTags("beachDay_sunset-drone.mov")).toEqual(["Beach", "Day", "Sunset", "Drone"]);
  });

  it("keeps mixed-case words as written and dedupes", () => {
    expect(suggestTags("iPhone review - iPhone camera test.mp4")).toEqual([
      "iPhone",
      "Review",
      "Camera",
      "Test",
    ]);
  });

  it("handles Arabic titles and drops Arabic stopwords", () => {
    expect(suggestTags("رحلة إلى الإسكندرية مع العائلة.mp4")).toEqual([
      "رحلة",
      "الإسكندرية",
      "العائلة",
    ]);
  });

  it("skips tags the video already has", () => {
    expect(suggestTags("Snowboard trip with the family.mp4", ["TRIP"])).toEqual([
      "Snowboard",
      "Family",
    ]);
  });

  it("returns at most eight suggestions", () => {
    const name = "alpha bravo charlie delta echo foxtrot golf hotel india juliet.mp4";
    expect(suggestTags(name)).toHaveLength(8);
  });
});

describe("tag store", () => {
  it("saves tags per file and survives a restart", () => {
    const storage = memoryStorage();
    const store = createTagStore(storage);
    store.set("C:\\Videos\\Trip.mp4", ["Snow", "snow", " Family "]);
    expect(store.get("C:\\Videos\\Trip.mp4")).toEqual(["Snow", "Family"]);
    // Windows paths compare case-insensitively, like the rest of Home.
    expect(store.get("c:/videos/trip.mp4")).toEqual(["Snow", "Family"]);
    const again = createTagStore(storage);
    expect(again.get("C:\\Videos\\Trip.mp4")).toEqual(["Snow", "Family"]);
    expect(storage.data.has(TAGS_STORAGE_KEY)).toBe(true);
  });

  it("removes a file's entry when its tags are cleared", () => {
    const storage = memoryStorage();
    const store = createTagStore(storage);
    store.set("/v/a.mp4", ["One"]);
    store.set("/v/a.mp4", []);
    expect(store.get("/v/a.mp4")).toEqual([]);
    expect(storage.data.has(TAGS_STORAGE_KEY)).toBe(false);
  });

  it("lists every tag, most used first, then alphabetically", () => {
    const store = createTagStore(memoryStorage());
    store.set("/v/a.mp4", ["Trip", "Family"]);
    store.set("/v/b.mp4", ["trip", "Beach"]);
    expect(store.all()).toEqual([
      { tag: "Trip", count: 2 },
      { tag: "Beach", count: 1 },
      { tag: "Family", count: 1 },
    ]);
  });

  it("notifies subscribers", () => {
    const store = createTagStore(memoryStorage());
    const listener = vi.fn();
    store.subscribe(listener);
    store.set("/v/a.mp4", ["One"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores corrupt storage", () => {
    const store = createTagStore(memoryStorage({ [TAGS_STORAGE_KEY]: "{not json" }));
    expect(store.all()).toEqual([]);
    const odd = createTagStore(
      memoryStorage({
        [TAGS_STORAGE_KEY]: JSON.stringify({
          files: { "/v/a.mp4": { path: "/v/a.mp4", tags: [1, "Ok"] } },
        }),
      }),
    );
    expect(odd.get("/v/a.mp4")).toEqual(["Ok"]);
  });

  it("does not throw when storage is full", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    const store = createTagStore(storage);
    expect(() => store.set("/v/a.mp4", ["One"])).not.toThrow();
    expect(store.get("/v/a.mp4")).toEqual(["One"]);
  });
});
