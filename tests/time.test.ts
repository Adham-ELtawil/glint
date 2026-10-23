import { describe, expect, it } from "vitest";
import { clampTime, formatPair, formatTime, parseTimestamp } from "../src/player/time";

describe("formatTime", () => {
  it("formats minutes and seconds the way YouTube does", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
    expect(formatTime(3599)).toBe("59:59");
  });

  it("adds hours once the clock reaches an hour", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3661)).toBe("1:01:01");
    expect(formatTime(65, true)).toBe("0:01:05");
  });

  it("treats garbage as zero", () => {
    expect(formatTime(Number.NaN)).toBe("0:00");
    expect(formatTime(-4)).toBe("0:00");
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("formatPair", () => {
  it("pads the current time with hours when the video is an hour or longer", () => {
    expect(formatPair(65, 3600)).toEqual({ current: "0:01:05", total: "1:00:00" });
    expect(formatPair(65, 120)).toEqual({ current: "1:05", total: "2:00" });
    expect(formatPair(3, Number.NaN)).toEqual({ current: "0:03", total: "0:00" });
  });
});

describe("parseTimestamp", () => {
  it("parses clock values and plain seconds", () => {
    expect(parseTimestamp("1:30")).toBe(90);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("00:00:01.250")).toBe(1.25);
    expect(parseTimestamp("12.5")).toBe(12.5);
    expect(parseTimestamp("nope")).toBeNull();
    expect(parseTimestamp("1:99")).toBeNull();
  });
});

describe("clampTime", () => {
  it("stays inside the duration", () => {
    expect(clampTime(10, 8)).toBe(8);
    expect(clampTime(-1, 8)).toBe(0);
    expect(clampTime(4, Number.NaN)).toBe(4);
  });
});
