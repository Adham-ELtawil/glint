/**
 * When to ask for a GitHub star. Pure functions over a small saved record, so
 * the rule can be unit tested. Nothing here touches the network: the record
 * lives in localStorage on this computer only.
 *
 * The rule: a "watch session" is a launch of Glint in which at least
 * {@link MIN_WATCH_MS} of video actually played, counted at most once per
 * calendar day. The card first appears after {@link FIRST_SESSIONS} watch
 * sessions and at least {@link FIRST_DAYS} days after Glint was first opened.
 * "Not now" waits {@link SNOOZE_DAYS} days and {@link SNOOZE_SESSIONS} more
 * watch sessions. It appears {@link MAX_SHOWS} times at most, and never again
 * after "Star on GitHub" or "Don't show again".
 */

export const STAR_STORAGE_KEY = "glint.starPrompt.v1";
export const STAR_URL = "https://github.com/Adham-ELtawil/glint";

export const MIN_WATCH_MS = 2 * 60 * 1000;
export const FIRST_SESSIONS = 5;
export const FIRST_DAYS = 3;
export const SNOOZE_SESSIONS = 10;
export const SNOOZE_DAYS = 30;
export const MAX_SHOWS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StarDone = "starred" | "never";

export interface StarState {
  v: 1;
  /** When Glint (with this feature) was first opened, ms since epoch. */
  firstRun: number;
  /** Watch sessions counted so far. */
  sessions: number;
  /** Local calendar day ("2026-11-21") of the last counted session. */
  lastSessionDay: string | null;
  /** How many times the card has been shown. */
  shows: number;
  lastShownAt: number | null;
  /** `sessions` at the moment the card was last shown. */
  sessionsAtLastShow: number;
  done: StarDone | null;
}

export function initialStarState(now: number): StarState {
  return {
    v: 1,
    firstRun: now,
    sessions: 0,
    lastSessionDay: null,
    shows: 0,
    lastShownAt: null,
    sessionsAtLastShow: 0,
    done: null,
  };
}

/** Saved state, or a fresh one (first run) when missing or unreadable. */
export function loadStarState(raw: string | null, now: number): StarState {
  if (raw == null) return initialStarState(now);
  try {
    const data = JSON.parse(raw) as Partial<StarState> | null;
    if (!data || data.v !== 1 || !isNum(data.firstRun)) return initialStarState(now);
    return {
      v: 1,
      firstRun: data.firstRun,
      sessions: isNum(data.sessions) ? data.sessions : 0,
      lastSessionDay: typeof data.lastSessionDay === "string" ? data.lastSessionDay : null,
      shows: isNum(data.shows) ? data.shows : 0,
      lastShownAt: isNum(data.lastShownAt) ? data.lastShownAt : null,
      sessionsAtLastShow: isNum(data.sessionsAtLastShow) ? data.sessionsAtLastShow : 0,
      done: data.done === "starred" || data.done === "never" ? data.done : null,
    };
  } catch {
    return initialStarState(now);
  }
}

/** The local calendar day of a timestamp. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Counts a watch session, at most one per calendar day. */
export function recordWatchSession(state: StarState, now: number): StarState {
  const day = dayKey(now);
  if (state.lastSessionDay === day) return state;
  return { ...state, sessions: state.sessions + 1, lastSessionDay: day };
}

export function shouldShowStar(state: StarState, now: number): boolean {
  if (state.done || state.shows >= MAX_SHOWS) return false;
  if (state.shows === 0 || state.lastShownAt == null) {
    return state.sessions >= FIRST_SESSIONS && now - state.firstRun >= FIRST_DAYS * DAY_MS;
  }
  return (
    state.sessions - state.sessionsAtLastShow >= SNOOZE_SESSIONS &&
    now - state.lastShownAt >= SNOOZE_DAYS * DAY_MS
  );
}

/**
 * Records that the card appeared. Showing it already snoozes it, so closing
 * Glint without answering counts as "Not now".
 */
export function markShown(state: StarState, now: number): StarState {
  return { ...state, shows: state.shows + 1, lastShownAt: now, sessionsAtLastShow: state.sessions };
}

export function markDone(state: StarState, reason: StarDone): StarState {
  return { ...state, done: reason };
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
