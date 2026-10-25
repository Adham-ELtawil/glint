import { describe, expect, it } from "vitest";
import { chapterAt, parseChapters } from "../src/player/chapters";
import { reachedEnd } from "../src/player/end";
import { describeMediaError } from "../src/player/errors";
import { isVideoFilename, naturalCompare, sortByFilename } from "../src/player/playlist";
import { formatRate, stepRate } from "../src/player/rates";

describe("chapters", () => {
  it("parses json and vtt sidecars", () => {
    expect(
      parseChapters(
        JSON.stringify([
          { start: 90, title: "Second" },
          { time: "0:10", title: "First" },
        ]),
        "json",
      ),
    ).toEqual([
      { start: 10, title: "First" },
      { start: 90, title: "Second" },
    ]);

    const vtt = `WEBVTT

00:00:00.000 --> 00:01:00.000
Opening

00:01:30.000 --> 00:04:00.000
Interview
`;
    expect(parseChapters(vtt, "vtt")).toEqual([
      { start: 0, title: "Opening" },
      { start: 90, title: "Interview" },
    ]);
    expect(chapterAt(parseChapters(vtt, "vtt"), 100)?.title).toBe("Interview");
    expect(parseChapters("{", "json")).toEqual([]);
  });
});

describe("reached end", () => {
  it("treats the ended flag and the final instant as finished", () => {
    expect(reachedEnd(1, 6, true)).toBe(true);
    expect(reachedEnd(6, 6, false)).toBe(true);
    expect(reachedEnd(5.999, 6, false)).toBe(true);
    expect(reachedEnd(5.9, 6, false)).toBe(false);
    expect(reachedEnd(0, 0, false)).toBe(false);
    expect(reachedEnd(Number.NaN, 6, false)).toBe(false);
  });
});

describe("playlist order", () => {
  it("sorts names naturally and ignores non-video files", () => {
    expect(naturalCompare("clip2.mp4", "clip10.mp4")).toBeLessThan(0);
    expect(naturalCompare("B.webm", "a.webm")).toBeGreaterThan(0);
    const sorted = sortByFilename([
      { filename: "b 10.mp4" },
      { filename: "b 2.mp4" },
      { filename: "a.mp4" },
    ]);
    expect(sorted.map((item) => item.filename)).toEqual(["a.mp4", "b 2.mp4", "b 10.mp4"]);
    expect(isVideoFilename("movie.MKV")).toBe(true);
    expect(isVideoFilename(".hidden.mp4")).toBe(false);
    expect(isVideoFilename("notes.txt")).toBe(false);
  });
});

describe("describeMediaError", () => {
  it("explains unsupported containers without blaming the user", () => {
    const copy = describeMediaError({ filename: "film.mkv", code: 4, extension: "mkv" });
    expect(copy.title).toBe("This file can't be played");
    expect(copy.body).toContain("film.mkv");
    expect(copy.body).toContain("planned");
    expect(copy.body).not.toContain("libmpv");
    expect(describeMediaError({ filename: "a.mp4", code: 2, extension: "mp4" }).title).toBe(
      "Playback was interrupted",
    );
  });
});

describe("playback rates", () => {
  it("steps between the YouTube speed stops", () => {
    expect(stepRate(1, 1)).toBe(1.25);
    expect(stepRate(1, -1)).toBe(0.75);
    expect(stepRate(0.25, -1)).toBe(0.25);
    expect(stepRate(2, 1)).toBe(2);
    expect(formatRate(1)).toBe("Normal");
    expect(formatRate(1.5)).toBe("1.5");
    expect(formatRate(2)).toBe("2");
  });
});
