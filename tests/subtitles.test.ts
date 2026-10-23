import { describe, expect, it } from "vitest";
import { srtToVtt, subtitleFormat } from "../src/player/subtitles";

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
