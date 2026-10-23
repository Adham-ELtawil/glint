import { describe, expect, it } from "vitest";
import { isTextEntry, mapShortcut, type KeyInput } from "../src/player/shortcuts";

function key(partial: Partial<KeyInput> & Pick<KeyInput, "key">): KeyInput {
  return {
    code: partial.code ?? "",
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    ...partial,
  };
}

describe("mapShortcut", () => {
  it("maps the YouTube playback keys", () => {
    expect(mapShortcut(key({ key: " " }))).toEqual({ type: "toggle-play" });
    expect(mapShortcut(key({ key: "k" }))).toEqual({ type: "toggle-play" });
    expect(mapShortcut(key({ key: "K" }))).toEqual({ type: "toggle-play" });
    expect(mapShortcut(key({ key: "j" }))).toEqual({ type: "seek", delta: -10 });
    expect(mapShortcut(key({ key: "l" }))).toEqual({ type: "seek", delta: 10 });
    expect(mapShortcut(key({ key: "ArrowLeft" }))).toEqual({ type: "seek", delta: -5 });
    expect(mapShortcut(key({ key: "ArrowRight" }))).toEqual({ type: "seek", delta: 5 });
    expect(mapShortcut(key({ key: "ArrowUp" }))).toEqual({ type: "volume", delta: 0.05 });
    expect(mapShortcut(key({ key: "ArrowDown" }))).toEqual({ type: "volume", delta: -0.05 });
    expect(mapShortcut(key({ key: "m" }))).toEqual({ type: "toggle-mute" });
    expect(mapShortcut(key({ key: "f" }))).toEqual({ type: "toggle-fullscreen" });
    expect(mapShortcut(key({ key: "c" }))).toEqual({ type: "toggle-captions" });
    expect(mapShortcut(key({ key: "t" }))).toEqual({ type: "toggle-theater" });
    expect(mapShortcut(key({ key: "Home" }))).toEqual({ type: "seek-start" });
    expect(mapShortcut(key({ key: "End" }))).toEqual({ type: "seek-end" });
    expect(mapShortcut(key({ key: "0" }))).toEqual({ type: "seek-ratio", ratio: 0 });
    expect(mapShortcut(key({ key: "5" }))).toEqual({ type: "seek-ratio", ratio: 0.5 });
    expect(mapShortcut(key({ key: "9" }))).toEqual({ type: "seek-ratio", ratio: 0.9 });
    expect(mapShortcut(key({ key: "<" }))).toEqual({ type: "cycle-rate", direction: -1 });
    expect(mapShortcut(key({ key: ">", code: "Period", shiftKey: true }))).toEqual({
      type: "cycle-rate",
      direction: 1,
    });
    expect(mapShortcut(key({ key: ",", code: "Comma", shiftKey: true }))).toEqual({
      type: "cycle-rate",
      direction: -1,
    });
    expect(mapShortcut(key({ key: "N", shiftKey: true }))).toEqual({ type: "next" });
    expect(mapShortcut(key({ key: "Escape" }))).toEqual({ type: "escape" });
  });

  it("ignores chords and shifted letters that are not shortcuts", () => {
    expect(mapShortcut(key({ key: "k", ctrlKey: true }))).toBeNull();
    expect(mapShortcut(key({ key: "o", metaKey: true }))).toBeNull();
    expect(mapShortcut(key({ key: "f", altKey: true }))).toBeNull();
    expect(mapShortcut(key({ key: "J", shiftKey: true }))).toBeNull();
    expect(mapShortcut(key({ key: "n" }))).toBeNull();
  });

  it("repeats seek and volume but not play or mute", () => {
    expect(mapShortcut(key({ key: "l", repeat: true }))).toEqual({ type: "seek", delta: 10 });
    expect(mapShortcut(key({ key: "ArrowDown", repeat: true }))).toEqual({
      type: "volume",
      delta: -0.05,
    });
    expect(mapShortcut(key({ key: " ", repeat: true }))).toBeNull();
    expect(mapShortcut(key({ key: "m", repeat: true }))).toBeNull();
  });
});

describe("isTextEntry", () => {
  it("lets player shortcuts through a volume slider", () => {
    expect(isTextEntry("INPUT", "range", false)).toBe(false);
    expect(isTextEntry("INPUT", "text", false)).toBe(true);
    expect(isTextEntry("TEXTAREA", null, false)).toBe(true);
    expect(isTextEntry("DIV", null, true)).toBe(true);
    expect(isTextEntry("BUTTON", null, false)).toBe(false);
  });
});
