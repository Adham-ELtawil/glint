// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createResumeStore } from "../src/player/resume-store";
import { initialState } from "../src/player/state";
import { PlayerView, type ViewActions } from "../src/ui/view";

function makeView() {
  const root = document.createElement("div");
  document.body.append(root);
  const calls: string[] = [];
  const volumes: number[] = [];
  const actions = new Proxy({} as ViewActions, {
    get:
      (_t, name: string) =>
      (...args: unknown[]) => {
        calls.push(name);
        if (name === "setVolume") volumes.push(args[0] as number);
      },
  });
  const view = new PlayerView(root, actions, true);
  view.render({ ...initialState(), phase: "ready", duration: 100 });
  return { root, view, calls, volumes };
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }),
  );

afterEach(() => document.body.replaceChildren());

describe("going home from the player", () => {
  it("has a Home button and a clickable brand", () => {
    const { root, calls } = makeView();
    const home = root.querySelector<HTMLButtonElement>(".home-nav")!;
    expect(home.getAttribute("aria-label")).toBe("Home (Backspace)");
    home.click();
    root.querySelector<HTMLElement>(".brand")!.click();
    expect(calls.filter((c) => c === "goHome")).toHaveLength(2);
  });

  it("goes home on Backspace but not Ctrl+Backspace", () => {
    const { calls } = makeView();
    key("Backspace", { ctrlKey: true });
    expect(calls).not.toContain("goHome");
    key("Backspace");
    expect(calls).toContain("goHome");
  });

  it("leaves Backspace alone while typing", () => {
    const { calls } = makeView();
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    expect(calls).not.toContain("goHome");
  });

  it("ignores player shortcuts on the home screen but keeps Ctrl+O", () => {
    const { view, root, calls } = makeView();
    view.setHomeActive(true);
    expect(root.querySelector(".home-nav")?.getAttribute("aria-current")).toBe("page");
    key(" ");
    key("k");
    key("Backspace");
    key("f");
    expect(calls).toEqual([]);
    key("o", { ctrlKey: true });
    expect(calls).toEqual(["openVideo"]);
    view.setHomeActive(false);
    key("k");
    expect(calls.length).toBeGreaterThan(1);
  });

  it("goes home with the mouse back button", () => {
    const { calls } = makeView();
    window.dispatchEvent(new MouseEvent("mouseup", { button: 3 }));
    expect(calls).toContain("goHome");
  });
});

describe("volume slider drag", () => {
  function slider(root: HTMLElement) {
    const input = root.querySelector<HTMLInputElement>(".volume-slider")!;
    input.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 160,
        width: 60,
        top: 0,
        bottom: 40,
        height: 40,
        x: 100,
        y: 0,
      }) as DOMRect;
    return input;
  }
  const pointer = (type: string, clientX: number, clientY = 20, pointerId = 7) =>
    new PointerEvent(type, { pointerId, clientX, clientY, button: 0, bubbles: true });

  it("holds the pop-out open while dragging off the track", () => {
    const { root, view, volumes } = makeView();
    const input = slider(root);
    const group = root.querySelector(".volume")!;
    input.dispatchEvent(pointer("pointerdown", 150));
    expect(group.classList.contains("is-dragging")).toBe(true);
    expect(view.isVolumeDragging()).toBe(true);
    // Far below and left of the 3px track: value still follows x.
    input.dispatchEvent(pointer("pointermove", 130, 120));
    input.dispatchEvent(pointer("pointermove", 40, 200));
    expect(volumes).toEqual([0.5, 0]);
    input.dispatchEvent(pointer("pointermove", 400, -50));
    expect(volumes.at(-1)).toBe(1);
    input.dispatchEvent(pointer("pointerup", 400));
    expect(group.classList.contains("is-dragging")).toBe(false);
  });

  it("maps x the same way as the native thumb travel", () => {
    const { root, volumes } = makeView();
    const input = slider(root);
    input.dispatchEvent(pointer("pointerdown", 106));
    input.dispatchEvent(pointer("pointermove", 106));
    input.dispatchEvent(pointer("pointermove", 154));
    input.dispatchEvent(pointer("pointermove", 118));
    expect(volumes).toEqual([0, 1, 0.25]);
    expect(input.value).toBe("0.25");
  });

  it("ignores other pointers and ends on cancel", () => {
    const { root, volumes } = makeView();
    const input = slider(root);
    const group = root.querySelector(".volume")!;
    input.dispatchEvent(pointer("pointerdown", 150));
    input.dispatchEvent(pointer("pointermove", 110, 20, 99));
    expect(volumes).toEqual([]);
    input.dispatchEvent(pointer("pointercancel", 110));
    expect(group.classList.contains("is-dragging")).toBe(false);
    input.dispatchEvent(pointer("pointermove", 110));
    expect(volumes).toEqual([]);
  });
});

describe("resume store forgetting", () => {
  function storage() {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }

  it("forgets one file or all files but keeps default prefs", () => {
    const mem = storage();
    const store = createResumeStore(mem, "test");
    store.setDefaults({ volume: 0.4, rate: 1.5 });
    store.updateFile("/a.mp4", { position: 30 });
    store.updateFile("/b.mp4", { position: 60 });
    store.forget("/a.mp4");
    expect(store.file("/a.mp4")).toBeNull();
    expect(createResumeStore(mem, "test").file("/b.mp4")?.position).toBe(60);
    store.forgetAll();
    const again = createResumeStore(mem, "test");
    expect(again.file("/b.mp4")).toBeNull();
    expect(again.prefs()).toMatchObject({ volume: 0.4, rate: 1.5 });
  });
});
