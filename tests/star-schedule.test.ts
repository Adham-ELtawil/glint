import { describe, expect, it } from "vitest";
import {
  FIRST_DAYS,
  FIRST_SESSIONS,
  MAX_SHOWS,
  SNOOZE_DAYS,
  SNOOZE_SESSIONS,
  initialStarState,
  loadStarState,
  markDone,
  markShown,
  recordWatchSession,
  shouldShowStar,
  type StarState,
} from "../src/star/schedule";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 10, 1, 20, 0).getTime();

/** One qualifying session per day for `days` days, starting the day after `from`. */
function watchDays(state: StarState, from: number, days: number): StarState {
  let s = state;
  for (let i = 1; i <= days; i++) s = recordWatchSession(s, from + i * DAY);
  return s;
}

describe("star prompt schedule", () => {
  it("never shows on first run", () => {
    expect(shouldShowStar(initialStarState(T0), T0)).toBe(false);
  });

  it("counts at most one watch session per calendar day", () => {
    let s = initialStarState(T0);
    s = recordWatchSession(s, T0);
    s = recordWatchSession(s, T0 + 60_000);
    s = recordWatchSession(s, T0 + 2 * 60 * 60 * 1000);
    expect(s.sessions).toBe(1);
    s = recordWatchSession(s, T0 + DAY);
    expect(s.sessions).toBe(2);
  });

  it(`needs ${FIRST_SESSIONS} watch days and ${FIRST_DAYS} days since first run`, () => {
    let s = initialStarState(T0);
    s = watchDays(s, T0 - DAY, FIRST_SESSIONS - 1); // 4 days: T0..T0+3d
    expect(shouldShowStar(s, T0 + 3 * DAY)).toBe(false);
    s = recordWatchSession(s, T0 + 4 * DAY);
    expect(s.sessions).toBe(FIRST_SESSIONS);
    expect(shouldShowStar(s, T0 + 4 * DAY)).toBe(true);
  });

  it("waits for the minimum age even with many sessions", () => {
    // Sessions can't pile up faster than one per day, but an imported or odd
    // clock state must still respect the minimum age.
    const s: StarState = { ...initialStarState(T0), sessions: 20 };
    expect(shouldShowStar(s, T0 + (FIRST_DAYS * DAY - 1))).toBe(false);
    expect(shouldShowStar(s, T0 + FIRST_DAYS * DAY)).toBe(true);
  });

  it("Not now snoozes for both more days and more sessions", () => {
    let s = watchDays(initialStarState(T0), T0 - DAY, FIRST_SESSIONS);
    const shownAt = T0 + 5 * DAY;
    s = markShown(s, shownAt);
    expect(s.shows).toBe(1);
    expect(shouldShowStar(s, shownAt)).toBe(false);
    // 30 days later but no new watching: still hidden.
    expect(shouldShowStar(s, shownAt + SNOOZE_DAYS * DAY)).toBe(false);
    // 10 more watch days quickly: still hidden until 30 days pass.
    s = watchDays(s, shownAt, SNOOZE_SESSIONS);
    expect(shouldShowStar(s, shownAt + SNOOZE_SESSIONS * DAY)).toBe(false);
    expect(shouldShowStar(s, shownAt + SNOOZE_DAYS * DAY)).toBe(true);
  });

  it(`shows at most ${MAX_SHOWS} times in total`, () => {
    let s = watchDays(initialStarState(T0), T0 - DAY, FIRST_SESSIONS);
    let now = T0 + 5 * DAY;
    for (let i = 0; i < MAX_SHOWS; i++) {
      expect(shouldShowStar(s, now)).toBe(true);
      s = markShown(s, now);
      s = watchDays(s, now, SNOOZE_DAYS);
      now += SNOOZE_DAYS * DAY;
    }
    expect(s.shows).toBe(MAX_SHOWS);
    expect(shouldShowStar(s, now + 365 * DAY)).toBe(false);
  });

  it("never shows again after Star or Don't show again", () => {
    const ready = watchDays(initialStarState(T0), T0 - DAY, FIRST_SESSIONS);
    const now = T0 + 5 * DAY;
    for (const reason of ["starred", "never"] as const) {
      let s = markDone(markShown(ready, now), reason);
      expect(s.done).toBe(reason);
      s = watchDays(s, now, 60);
      expect(shouldShowStar(s, now + 90 * DAY)).toBe(false);
    }
  });

  it("loads saved state and starts fresh on missing or broken data", () => {
    expect(loadStarState(null, T0)).toEqual(initialStarState(T0));
    expect(loadStarState("{nope", T0)).toEqual(initialStarState(T0));
    expect(loadStarState(JSON.stringify({ v: 99 }), T0)).toEqual(initialStarState(T0));
    const saved = markShown({ ...initialStarState(T0 - 9 * DAY), sessions: 7 }, T0 - DAY);
    expect(loadStarState(JSON.stringify(saved), T0)).toEqual(saved);
  });

  it("treats a clock that went backwards as not yet eligible", () => {
    const s: StarState = { ...initialStarState(T0), sessions: 20 };
    expect(shouldShowStar(s, T0 - 10 * DAY)).toBe(false);
  });
});
