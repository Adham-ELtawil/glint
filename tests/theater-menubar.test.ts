// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialState, type PlayerState } from "../src/player/state";
import { PlayerView, type ViewActions } from "../src/ui/view";

function makeView() {
  const root = document.createElement("div");
  document.body.append(root);
  const goHome = vi.fn();
  const actions = new Proxy({} as ViewActions, {
    get: (_target, name) => (name === "goHome" ? goHome : () => {}),
  });
  return { root, view: new PlayerView(root, actions, false), goHome };
}

function playing(patch: Partial<PlayerState> = {}): PlayerState {
  return {
    ...initialState(),
    phase: "ready",
    duration: 100,
    currentTime: 25,
    playing: true,
    theater: true,
    ...patch,
  };
}

const move = (target: Element, x: number, y: number) =>
  target.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("top bar in theater mode (issue #16)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("hides with the controls while playing and comes back when the mouse moves", () => {
    const { root, view } = makeView();
    view.render(playing());
    vi.advanceTimersByTime(3100);
    expect(root.classList.contains("is-idle")).toBe(true);
    expect(root.querySelector(".player")!.classList.contains("controls-hidden")).toBe(true);

    vi.advanceTimersByTime(300);
    move(root.querySelector(".player")!, 400, 10);
    expect(root.classList.contains("is-idle")).toBe(false);
  });

  it("stays up while paused", () => {
    const { root, view } = makeView();
    view.render(playing({ playing: false }));
    vi.advanceTimersByTime(10_000);
    expect(root.classList.contains("is-idle")).toBe(false);
  });

  it("stays up while the pointer is on it", () => {
    const { root, view } = makeView();
    view.render(playing());
    const bar = root.querySelector(".menubar")!;
    bar.dispatchEvent(new PointerEvent("pointerenter"));
    vi.advanceTimersByTime(10_000);
    expect(root.classList.contains("is-idle")).toBe(false);

    bar.dispatchEvent(new PointerEvent("pointerleave"));
    vi.advanceTimersByTime(3100);
    expect(root.classList.contains("is-idle")).toBe(true);
  });

  it("offers Home in the video's right-click menu", () => {
    const { root, view, goHome } = makeView();
    view.render(playing());
    root
      .querySelector(".player")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const items = [...root.querySelectorAll<HTMLButtonElement>(".context .menu-item")];
    const home = items.find((item) => item.textContent?.startsWith("Home"));
    expect(home).toBeDefined();
    home!.click();
    expect(goHome).toHaveBeenCalledOnce();
  });

  it("floats the bar over the video in theater mode instead of removing it", () => {
    expect(css).not.toMatch(/\.app\.is-theater \.menubar\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.app\.is-theater:not\(\.is-home\):not\(\.is-fullscreen\) \.menubar \{/);
    expect(css).toMatch(/\.app\.is-fullscreen \.menubar \{\s*display: none;/);
  });
});
