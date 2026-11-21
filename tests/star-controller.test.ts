import { describe, expect, it, vi } from "vitest";
import { StarPromptController } from "../src/star/controller";
import {
  FIRST_SESSIONS,
  MIN_WATCH_MS,
  STAR_STORAGE_KEY,
  initialStarState,
  loadStarState,
  type StarState,
} from "../src/star/schedule";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 10, 1, 20, 0).getTime();

function memoryStorage(initial?: StarState) {
  const data = new Map<string, string>();
  if (initial) data.set(STAR_STORAGE_KEY, JSON.stringify(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

function setup(initial?: StarState, start = T0 + 10 * DAY) {
  const storage = memoryStorage(initial);
  let now = start;
  const render = vi.fn();
  const openRepo = vi.fn();
  const star = new StarPromptController(storage, { render, openRepo, now: () => now });
  const saved = () => loadStarState(storage.data.get(STAR_STORAGE_KEY) ?? null, 0);
  const advance = (ms: number) => (now += ms);
  const watch = (ms: number) => {
    star.notePlayback(true);
    advance(ms);
    star.notePlayback(true);
    star.notePlayback(false);
  };
  return { star, storage, render, openRepo, saved, advance, watch };
}

/** Ready to show once this launch has a watch session. */
const ready: StarState = { ...initialStarState(T0), sessions: FIRST_SESSIONS - 1 };

describe("StarPromptController", () => {
  it("saves a first-run record and never shows on first run", () => {
    const { star, saved, watch, render } = setup(undefined, T0);
    expect(saved().firstRun).toBe(T0);
    watch(MIN_WATCH_MS);
    expect(star.offer()).toBe(false);
    expect(render).not.toHaveBeenCalledWith(true, false);
  });

  it("counts a session only after two minutes of real playback", () => {
    const { star, saved, watch } = setup(ready);
    watch(MIN_WATCH_MS - 1000);
    expect(saved().sessions).toBe(FIRST_SESSIONS - 1);
    expect(star.offer()).toBe(false);
    watch(1000);
    expect(saved().sessions).toBe(FIRST_SESSIONS);
  });

  it("does not count paused time", () => {
    const { saved, star, advance } = setup(ready);
    star.notePlayback(true);
    advance(60_000);
    star.notePlayback(false);
    advance(10 * 60_000);
    star.notePlayback(false);
    expect(saved().sessions).toBe(FIRST_SESSIONS - 1);
  });

  it("shows once at a calm moment and records it", () => {
    const { star, saved, watch, render } = setup(ready);
    watch(MIN_WATCH_MS);
    expect(star.offer()).toBe(true);
    expect(render).toHaveBeenLastCalledWith(true, false);
    expect(saved().shows).toBe(1);
    star.notNow();
    expect(render).toHaveBeenLastCalledWith(false, false);
    expect(star.offer()).toBe(false);
  });

  it("waits while the update card or fullscreen covers it", () => {
    const { star, watch, render } = setup(ready);
    watch(MIN_WATCH_MS);
    star.setCovered(true);
    expect(star.offer()).toBe(false);
    star.setCovered(false);
    expect(star.offer()).toBe(true);
    star.setCovered(true);
    expect(render).toHaveBeenLastCalledWith(false, false);
    star.setCovered(false);
    expect(render).toHaveBeenLastCalledWith(true, false);
  });

  it("goes away when a video starts playing", () => {
    const { star, watch, render } = setup(ready);
    watch(MIN_WATCH_MS);
    star.offer();
    star.notePlayback(true);
    expect(star.visible).toBe(false);
    expect(render).toHaveBeenLastCalledWith(false, false);
  });

  it("Star on GitHub opens the page and never asks again", () => {
    const { star, watch, saved, openRepo } = setup(ready);
    watch(MIN_WATCH_MS);
    star.offer();
    star.star();
    expect(openRepo).toHaveBeenCalledOnce();
    expect(saved().done).toBe("starred");
    expect(star.visible).toBe(false);
  });

  it("Don't show again never asks again", () => {
    const { star, watch, saved, openRepo } = setup(ready);
    watch(MIN_WATCH_MS);
    star.offer();
    star.never();
    expect(openRepo).not.toHaveBeenCalled();
    expect(saved().done).toBe("never");
  });

  it("the Help menu item opens the page and counts as starred", () => {
    const { star, saved, openRepo } = setup();
    star.openFromMenu();
    expect(openRepo).toHaveBeenCalledOnce();
    expect(saved().done).toBe("starred");
  });

  it("a preview shows the card without changing the saved record", () => {
    const { star, storage, render, openRepo } = setup(undefined, T0);
    const before = storage.data.get(STAR_STORAGE_KEY);
    star.preview();
    expect(render).toHaveBeenLastCalledWith(true, true);
    star.never();
    star.preview();
    star.star();
    expect(openRepo).toHaveBeenCalledOnce();
    expect(storage.data.get(STAR_STORAGE_KEY)).toBe(before);
  });

  it("keeps working when storage throws", () => {
    const render = vi.fn();
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const star = new StarPromptController(broken, { render, openRepo: vi.fn(), now: () => T0 });
    star.notePlayback(true);
    expect(star.offer()).toBe(false);
  });
});
