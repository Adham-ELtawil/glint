import { describe, expect, it } from "vitest";
import { matchTerms, searchItems, searchTerms } from "../src/home/search";

const titles = (items: string[], query: string) => searchItems(items, query, (t) => t);

describe("searchTerms", () => {
  it("splits on whitespace, lower-cases and drops repeats", () => {
    expect(searchTerms("  Cats  DOGS\tcats ")).toEqual(["cats", "dogs"]);
  });

  it("is empty for a blank query", () => {
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("matchTerms", () => {
  it("counts matching terms and reports the earliest one", () => {
    expect(matchTerms("Big Cats and Dogs", ["fish", "dogs", "cats"])).toEqual({
      count: 2,
      first: 1,
    });
  });

  it("returns null when nothing matches", () => {
    expect(matchTerms("Holiday 2024", ["cats"])).toBeNull();
  });

  it("matches inside words and ignores case", () => {
    expect(matchTerms("MyHOLIDAY_clip", ["holiday"])).toEqual({ count: 1, first: 0 });
  });

  it("matches Arabic titles", () => {
    expect(matchTerms("رحلة الإسكندرية", ["رحلة"])).toEqual({ count: 1, first: 0 });
  });
});

describe("searchItems", () => {
  const items = ["dog walk", "cat nap", "cat and dog", "bird song", "dog park cat"];

  it("returns everything in order for an empty query", () => {
    expect(titles(items, "")).toEqual(items);
  });

  it("uses OR: any term matching is enough", () => {
    expect(titles(items, "bird nap")).toEqual(["bird song", "cat nap"]);
  });

  it("ranks by the number of matched terms first", () => {
    expect(titles(items, "cat dog")[0]).toBe("cat and dog");
    expect(titles(items, "cat dog").slice(0, 2)).toEqual(["cat and dog", "dog park cat"]);
  });

  it("then by the earliest-typed term matched", () => {
    // Single matches: "cat" was typed before "dog", so cat videos lead.
    expect(titles(["dog walk", "cat nap", "fish"], "cat dog")).toEqual(["cat nap", "dog walk"]);
    expect(titles(["dog walk", "cat nap", "fish"], "dog cat")).toEqual(["dog walk", "cat nap"]);
  });

  it("keeps the original order for ties", () => {
    expect(titles(items, "dog")).toEqual(["dog walk", "cat and dog", "dog park cat"]);
  });

  it("is case-insensitive", () => {
    expect(titles(["Summer TRIP", "winter"], "trip")).toEqual(["Summer TRIP"]);
  });

  it("returns nothing when no title matches", () => {
    expect(titles(items, "zebra")).toEqual([]);
  });

  it("does not modify the input", () => {
    const copy = [...items];
    titles(items, "cat dog");
    expect(items).toEqual(copy);
  });
});
