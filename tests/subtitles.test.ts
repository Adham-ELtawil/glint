import { describe, expect, it } from "vitest";
import {
  clampSubtitleDelay,
  formatSubtitleDelay,
  shiftVtt,
  srtToVtt,
  subtitleFormat,
} from "../src/player/subtitles";

describe("srtToVtt", () => {
  it("converts sequence numbers and comma timestamps", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:07,500
Second line
continues
`;
    expect(srtToVtt(srt)).toBe(`WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.000 --> 00:00:07.500
Second line
continues
`);
  });

  it("normalizes CRLF and a leading BOM", () => {
    const srt = `\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\n`;
    expect(srtToVtt(srt)).toContain("00:00:01.000 --> 00:00:02.000\nHi");
    expect(srtToVtt(srt).startsWith("WEBVTT")).toBe(true);
  });

  it("keeps cue text commas and basic tags", () => {
    const srt = `1
00:00:01,000 --> 00:00:02,000
Hello, <i>world</i>
`;
    expect(srtToVtt(srt)).toContain("Hello, <i>world</i>");
  });

  it("passes WebVTT through", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAlready good\n";
    expect(srtToVtt(vtt)).toBe(vtt);
  });

  it("drops positioning junk SubRip sometimes adds", () => {
    const srt = `1
00:00:01,000 --> 00:00:02,000 X1:10 Y1:20
Placed
`;
    const vtt = srtToVtt(srt);
    expect(vtt).toContain("00:00:01.000 --> 00:00:02.000\n");
    expect(vtt).not.toContain("X1:");
  });

  it("returns an empty document for an empty file", () => {
    expect(srtToVtt("   ")).toBe("WEBVTT\n\n");
  });
});

describe("subtitleFormat", () => {
  it("accepts srt and vtt sidecars and skips chapter tracks", () => {
    expect(subtitleFormat("Lecture.srt")).toBe("srt");
    expect(subtitleFormat("Lecture.en.vtt")).toBe("vtt");
    expect(subtitleFormat("Lecture.chapters.vtt")).toBeNull();
    expect(subtitleFormat("Lecture.chapters.srt")).toBeNull();
    expect(subtitleFormat("notes.txt")).toBeNull();
  });
});

describe("subtitle delay", () => {
  const vtt = [
    "WEBVTT",
    "",
    "NOTE 00:00:01.000 --> 00:00:02.000 is not a cue",
    "",
    "1",
    "00:00:00.200 --> 00:00:00.400",
    "Gone",
    "",
    "00:00:00.300 --> 00:00:01.500 align:start",
    "Clipped",
    "",
    "01:59:59.900 --> 02:00:01.000",
    "Late",
    "",
  ].join("\n");

  it("moves cues later and earlier", () => {
    expect(shiftVtt(vtt, 0)).toBe(vtt);
    const later = shiftVtt(vtt, 1.5);
    expect(later).toContain("00:00:01.700 --> 00:00:01.900\nGone");
    expect(later).toContain("02:00:01.400 --> 02:00:02.500\nLate");
    expect(later).toContain("NOTE 00:00:01.000 --> 00:00:02.000 is not a cue");
    const earlier = shiftVtt(vtt, -0.5);
    expect(earlier).not.toContain("Gone");
    expect(earlier).toContain("00:00:00.000 --> 00:00:01.000 align:start\nClipped");
    expect(earlier).toContain("01:59:59.400 --> 02:00:00.500\nLate");
    expect(earlier.startsWith("WEBVTT")).toBe(true);
  });

  it("keeps the delay on a 0.1 s grid within a minute", () => {
    let delay = 0;
    for (let i = 0; i < 3; i++) delay = clampSubtitleDelay(delay + 0.1);
    expect(delay).toBe(0.3);
    expect(clampSubtitleDelay(-0.04)).toBe(0);
    expect(clampSubtitleDelay(500)).toBe(60);
    expect(clampSubtitleDelay(Number.NaN)).toBe(0);
    expect(formatSubtitleDelay(0.3)).toBe("+0.3 s");
    expect(formatSubtitleDelay(-1.26)).toBe("\u22121.3 s");
    expect(formatSubtitleDelay(0)).toBe("0 s");
  });
});
