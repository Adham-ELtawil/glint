// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initialState, type PlayerState } from "../src/player/state";
import { PlayerView, type ViewActions } from "../src/ui/view";

function makeView(): { root: HTMLElement; view: PlayerView } {
  const root = document.createElement("div");
  document.body.append(root);
  const actions = new Proxy({} as ViewActions, { get: () => () => {} });
  return { root, view: new PlayerView(root, actions, false) };
}

function ready(patch: Partial<PlayerState> = {}): PlayerState {
  return { ...initialState(), phase: "ready", duration: 100, currentTime: 25, ...patch };
}

afterEach(() => document.body.replaceChildren());

describe("progress bar chapters", () => {
  it("draws one unbroken segment without chapters", () => {
    const { root, view } = makeView();
    view.render(ready());
    const segments = root.querySelectorAll<HTMLElement>(".segment");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.style.clipPath).toBe("inset(0 0px 0 0px)");
  });

  it("splits the bar into chapter segments with a gap between them", () => {
    const { root, view } = makeView();
    const chapters = [
      { start: 0, title: "Intro" },
      { start: 40, title: "Middle" },
      { start: 75, title: "End" },
    ];
    view.render(ready({ chapters, chapterTitle: "Intro" }));
    const segments = [...root.querySelectorAll<HTMLElement>(".segment")];
    expect(segments).toHaveLength(3);
    expect(segments[0]!.style.clipPath).toBe("inset(0 calc(60% + 2px) 0 0px)");
    expect(segments[1]!.style.clipPath).toBe("inset(0 calc(25% + 2px) 0 calc(40% + 2px))");
    expect(segments[2]!.style.clipPath).toBe("inset(0 0px 0 calc(75% + 2px))");
    // every segment shows the same played width, so it lines up with the handle
    for (const segment of segments) {
      expect(segment.querySelector<HTMLElement>(".played")!.style.width).toBe("25%");
    }
    expect(root.querySelector<HTMLElement>(".handle")!.style.left).toBe("25%");
  });

  it("shows the chapter title followed by a chevron", () => {
    const { root, view } = makeView();
    view.render(ready({ chapters: [{ start: 0, title: "Intro" }], chapterTitle: "Intro" }));
    const label = root.querySelector<HTMLElement>(".chapter-label")!;
    expect(label.hidden).toBe(false);
    expect(label.querySelector(".chapter-title")!.textContent).toBe("Intro");
    expect(label.lastElementChild!.classList.contains("chapter-chevron")).toBe(true);
  });
});

describe("control glyphs", () => {
  it("keeps one morphing play/pause glyph and only flips the player state", () => {
    const { root, view } = makeView();
    view.render(ready({ playing: false }));
    const svg = root.querySelector(".play-toggle svg");
    expect(root.querySelectorAll(".play-toggle path")).toHaveLength(2);
    view.render(ready({ playing: true }));
    expect(root.querySelector(".play-toggle svg")).toBe(svg);
    expect(root.querySelector<HTMLElement>(".player")!.dataset.playing).toBe("true");
    expect(root.querySelector(".play-toggle")!.getAttribute("aria-label")).toBe("Pause (k)");
  });

  it("swaps the theater glyph and label with the mode", () => {
    const { root, view } = makeView();
    view.render(ready({ theater: false }));
    const button = root.querySelector('[data-tip="Theater mode (t)"]');
    expect(button).not.toBeNull();
    const before = button!.innerHTML;
    view.render(ready({ theater: true }));
    expect(button!.getAttribute("aria-label")).toBe("Default view (t)");
    expect(button!.innerHTML).not.toBe(before);
  });

  it("uses the YouTube-style bezel for play and pause only", () => {
    const { root, view } = makeView();
    view.flash({ kind: "pause" });
    expect(root.querySelector(".feedback-bubble")!.classList.contains("is-bezel")).toBe(true);
    view.flash({ kind: "seek", direction: 1, label: "5 seconds" });
    expect(root.querySelector(".feedback-bubble")!.classList.contains("is-bezel")).toBe(false);
  });
});

describe("reduced motion", () => {
  // Windows "Animation effects: off" maps to prefers-reduced-motion: reduce.
  // The small control animations must keep running there, like on YouTube.
  const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  const blocks = [
    ...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g),
  ].map((m) => m[1]!);

  it("never switches animations or transitions off", () => {
    for (const block of blocks) {
      expect(block).not.toMatch(/animation:\s*none/);
      expect(block).not.toMatch(/transition:\s*none/);
    }
  });

  it("leaves the center bezel and the control bar alone", () => {
    for (const block of blocks) {
      expect(block).not.toMatch(/feedback|\.controls|\.gradient|\.segment|\.handle|play-toggle/);
    }
  });
});
