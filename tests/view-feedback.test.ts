// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_HIDE_MS, PlayerView, type ViewActions } from "../src/ui/view";

function makeView(): { root: HTMLElement; view: PlayerView } {
  const root = document.createElement("div");
  document.body.append(root);
  const actions = new Proxy({} as ViewActions, { get: () => () => {} });
  return { root, view: new PlayerView(root, actions, false) };
}

const bubbles = (root: HTMLElement) => root.querySelectorAll(".feedback-bubble");
const feedback = (root: HTMLElement) => root.querySelector<HTMLElement>(".feedback")!;

describe("center play/pause feedback bubble", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("hides after the timeout even if animationend never fires (reduced motion)", () => {
    const { root, view } = makeView();
    view.flash({ kind: "pause" });
    expect(bubbles(root)).toHaveLength(1);
    expect(feedback(root).hidden).toBe(false);

    vi.advanceTimersByTime(FEEDBACK_HIDE_MS);

    expect(bubbles(root)).toHaveLength(0);
    expect(feedback(root).hidden).toBe(true);
  });

  it("cleans up early on animationend and the later timer is harmless", () => {
    const { root, view } = makeView();
    view.flash({ kind: "play" });
    bubbles(root)[0]!.dispatchEvent(new Event("animationend"));
    expect(bubbles(root)).toHaveLength(0);
    expect(feedback(root).hidden).toBe(true);

    view.flash({ kind: "pause" });
    vi.advanceTimersByTime(FEEDBACK_HIDE_MS / 2);
    expect(bubbles(root)).toHaveLength(1);
    vi.advanceTimersByTime(FEEDBACK_HIDE_MS);
    expect(feedback(root).hidden).toBe(true);
  });

  it("restarts the timer on a rapid re-flash so the new bubble gets its full time", () => {
    const { root, view } = makeView();
    view.flash({ kind: "pause" });
    vi.advanceTimersByTime(FEEDBACK_HIDE_MS - 50);
    const firstBubble = bubbles(root)[0]!;
    view.flash({ kind: "play" });
    // a stale animationend from the replaced bubble must not hide the new one
    firstBubble.dispatchEvent(new Event("animationend"));
    vi.advanceTimersByTime(100);
    expect(bubbles(root)).toHaveLength(1);
    expect(feedback(root).hidden).toBe(false);
    vi.advanceTimersByTime(FEEDBACK_HIDE_MS);
    expect(bubbles(root)).toHaveLength(0);
    expect(feedback(root).hidden).toBe(true);
  });

  it("never leaves more than one bubble after many quick toggles", () => {
    const { root, view } = makeView();
    for (let i = 0; i < 10; i++) {
      view.flash({ kind: i % 2 ? "play" : "pause" });
      vi.advanceTimersByTime(60);
    }
    expect(bubbles(root)).toHaveLength(1);
    vi.advanceTimersByTime(FEEDBACK_HIDE_MS);
    expect(feedback(root).hidden).toBe(true);
  });
});
