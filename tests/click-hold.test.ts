// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "../src/player/state";
import { CLICK_HOLD_MS, PlayerView, type ViewActions } from "../src/ui/view";

function makeView() {
  const root = document.createElement("div");
  document.body.append(root);
  const calls: string[] = [];
  const actions = new Proxy({} as ViewActions, {
    get: (_t, name: string) => () => void calls.push(name),
  });
  const view = new PlayerView(root, actions, true);
  view.render({ ...initialState(), phase: "ready", duration: 100, playing: true });
  const gesture = root.querySelector<HTMLElement>(".gesture")!;
  const down = (button = 0) =>
    gesture.dispatchEvent(new PointerEvent("pointerdown", { button, bubbles: true }));
  const up = (button = 0) => {
    window.dispatchEvent(new PointerEvent("pointerup", { button, bubbles: true }));
    gesture.dispatchEvent(new MouseEvent("click", { button, bubbles: true }));
  };
  return { calls, down, up };
}

describe("left mouse on the video: click to play/pause, hold for 2x", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    window.dispatchEvent(new Event("blur"));
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("a quick click toggles play and never boosts", () => {
    const { calls, down, up } = makeView();
    down();
    vi.advanceTimersByTime(CLICK_HOLD_MS - 100);
    up();
    vi.advanceTimersByTime(CLICK_HOLD_MS * 2);
    expect(calls).toEqual(["togglePlay"]);
  });

  it("holding boosts, and releasing ends it without toggling play", () => {
    const { calls, down, up } = makeView();
    down();
    vi.advanceTimersByTime(CLICK_HOLD_MS);
    expect(calls).toEqual(["startBoost"]);
    vi.advanceTimersByTime(3000);
    up();
    expect(calls).toEqual(["startBoost", "endBoost"]);
    down();
    up();
    expect(calls).toEqual(["startBoost", "endBoost", "togglePlay"]);
  });

  it("losing focus mid-hold ends the boost", () => {
    const { calls, down } = makeView();
    down();
    vi.advanceTimersByTime(CLICK_HOLD_MS);
    window.dispatchEvent(new Event("blur"));
    expect(calls).toEqual(["startBoost", "endBoost"]);
  });

  it("the right button never boosts", () => {
    const { calls, down } = makeView();
    down(2);
    vi.advanceTimersByTime(CLICK_HOLD_MS * 2);
    expect(calls).toEqual([]);
  });
});
