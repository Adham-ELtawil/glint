// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "../src/player/state";
import { PlayerView, SPACE_HOLD_MS, type ViewActions } from "../src/ui/view";

function makeView() {
  const root = document.createElement("div");
  document.body.append(root);
  const calls: string[] = [];
  const actions = new Proxy({} as ViewActions, {
    get:
      (_t, name: string) =>
      (...args: unknown[]) => {
        const action = args[0] as { type?: string } | undefined;
        calls.push(name === "shortcut" ? `shortcut:${action?.type}` : name);
      },
  });
  const view = new PlayerView(root, actions, true);
  view.render({ ...initialState(), phase: "ready", duration: 100, playing: true });
  return { root, view, calls };
}

const fire = (type: "keydown" | "keyup", init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent(type, { key: " ", bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
};

describe("Space: tap to play/pause, hold for 2x", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    window.dispatchEvent(new Event("blur"));
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("a quick tap toggles play on release and never boosts", () => {
    const { calls } = makeView();
    expect(fire("keydown").defaultPrevented).toBe(true);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(SPACE_HOLD_MS - 50);
    expect(fire("keyup").defaultPrevented).toBe(true);
    expect(calls).toEqual(["shortcut:toggle-play"]);
    vi.advanceTimersByTime(SPACE_HOLD_MS * 2);
    expect(calls).toEqual(["shortcut:toggle-play"]);
  });

  it("holding boosts after the threshold and release ends it without toggling", () => {
    const { calls } = makeView();
    fire("keydown");
    for (let i = 0; i < 10; i++) fire("keydown", { repeat: true });
    vi.advanceTimersByTime(SPACE_HOLD_MS);
    expect(calls).toEqual(["startBoost"]);
    vi.advanceTimersByTime(2000);
    fire("keyup");
    expect(calls).toEqual(["startBoost", "endBoost"]);
  });

  it("losing focus mid-hold ends the boost, and mid-tap drops the tap", () => {
    const { calls } = makeView();
    fire("keydown");
    vi.advanceTimersByTime(SPACE_HOLD_MS);
    window.dispatchEvent(new Event("blur"));
    expect(calls).toEqual(["startBoost", "endBoost"]);
    fire("keyup");
    expect(calls).toEqual(["startBoost", "endBoost"]);

    fire("keydown");
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(SPACE_HOLD_MS * 2);
    fire("keyup");
    expect(calls).toEqual(["startBoost", "endBoost"]);
  });

  it("K still toggles immediately and Shift+Space is not a hold", () => {
    const { calls } = makeView();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", cancelable: true }));
    expect(calls).toEqual(["shortcut:toggle-play"]);
    fire("keydown", { shiftKey: true });
    vi.advanceTimersByTime(SPACE_HOLD_MS * 2);
    expect(calls).toEqual(["shortcut:toggle-play"]);
  });

  it("ignores Space while typing in a text field", () => {
    const { root, calls } = makeView();
    const input = document.createElement("input");
    root.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    vi.advanceTimersByTime(SPACE_HOLD_MS * 2);
    input.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    expect(calls).toEqual([]);
  });

  it("shows the 2x pill only while boosting", () => {
    const { root, view } = makeView();
    const pill = root.querySelector<HTMLElement>(".boost-pill")!;
    expect(pill.hidden).toBe(true);
    view.render({
      ...initialState(),
      phase: "ready",
      duration: 100,
      playing: true,
      boosting: true,
    });
    expect(pill.hidden).toBe(false);
    expect(pill.textContent).toContain("2x");
    view.render({ ...initialState(), phase: "ready", duration: 100, playing: true });
    expect(pill.hidden).toBe(true);
  });
});
