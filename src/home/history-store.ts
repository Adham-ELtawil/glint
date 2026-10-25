/**
 * Watch history for the home screen's "Continue watching" row. Entries are
 * ordered by when they were last watched and kept in this browser profile's
 * localStorage (inside the app's own data folder), never sent anywhere.
 */
export interface HistoryEntry {
  /** Same id the resume store uses: the canonical filesystem path. */
  id: string;
  path: string;
  filename: string;
  /** Seconds. */
  position: number;
  /** Seconds, 0 until playback reports it. */
  duration: number;
  /** Epoch milliseconds. */
  watchedAt: number;
}

export interface HistoryStore {
  list(): HistoryEntry[];
  get(id: string): HistoryEntry | null;
  record(item: { id: string; path: string; filename: string }, now?: number): void;
  progress(id: string, position: number, duration: number, now?: number): void;
  remove(id: string): void;
  /** Put a removed entry back (Undo). */
  restore(entry: HistoryEntry): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export const HISTORY_STORAGE_KEY = "glint.history.v1";
/** Enough for several rows of "Continue watching" without becoming a log. */
export const MAX_HISTORY = 60;

type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createHistoryStore(
  storage: HistoryStorage,
  key = HISTORY_STORAGE_KEY,
): HistoryStore {
  let entries = read(storage, key);
  const listeners = new Set<() => void>();

  const commit = (next: HistoryEntry[]) => {
    entries = sortByRecent(next).slice(0, MAX_HISTORY);
    try {
      if (entries.length === 0) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(entries));
    } catch {
      // Storage can be full or unavailable. History is a convenience.
    }
    for (const listener of listeners) listener();
  };

  return {
    list: () => entries,
    get: (id) => entries.find((entry) => entry.id === id) ?? null,
    record(item, now = Date.now()) {
      if (!item.id || !item.path) return;
      const previous = entries.find((entry) => entry.id === item.id);
      const entry: HistoryEntry = {
        id: item.id,
        path: item.path,
        filename: item.filename || basename(item.path),
        position: previous?.position ?? 0,
        duration: previous?.duration ?? 0,
        watchedAt: now,
      };
      commit([entry, ...entries.filter((other) => other.id !== item.id)]);
    },
    progress(id, position, duration, now = Date.now()) {
      const previous = entries.find((entry) => entry.id === id);
      if (!previous) return;
      const next: HistoryEntry = {
        ...previous,
        position: Number.isFinite(position) ? Math.max(0, position) : previous.position,
        duration: Number.isFinite(duration) && duration > 0 ? duration : previous.duration,
        watchedAt: now,
      };
      if (
        next.position === previous.position &&
        next.duration === previous.duration &&
        now - previous.watchedAt < 1000
      ) {
        return;
      }
      commit([next, ...entries.filter((entry) => entry.id !== id)]);
    },
    remove(id) {
      if (!entries.some((entry) => entry.id === id)) return;
      commit(entries.filter((entry) => entry.id !== id));
    },
    restore(entry) {
      const clean = sanitize(entry);
      if (!clean) return;
      commit([clean, ...entries.filter((other) => other.id !== clean.id)]);
    },
    clear() {
      commit([]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * How much of the bar to fill on a card. Anything inside the last 10
 * seconds (where Glint restarts instead of resuming) counts as watched.
 */
export function watchedRatio(position: number, duration: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0;
  if (position <= 0) return 0;
  if (position >= duration - 10) return 1;
  return Math.min(1, Math.max(0, position / duration));
}

export function basename(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** The folder a file lives in, for the card's second line. */
export function parentName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  if (parts.length < 2) return "";
  return parts[parts.length - 2] ?? "";
}

function sortByRecent(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => b.watchedAt - a.watchedAt);
}

function read(storage: Pick<Storage, "getItem">, key: string): HistoryEntry[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: HistoryEntry[] = [];
    for (const value of parsed) {
      const entry = sanitize(value);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
    return sortByRecent(out).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function sanitize(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const path = typeof record.path === "string" ? record.path : "";
  if (!id || !path) return null;
  const num = (field: unknown) =>
    typeof field === "number" && Number.isFinite(field) && field >= 0 ? field : 0;
  return {
    id,
    path,
    filename:
      typeof record.filename === "string" && record.filename ? record.filename : basename(path),
    position: num(record.position),
    duration: num(record.duration),
    watchedAt: num(record.watchedAt),
  };
}
