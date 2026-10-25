import { clamp01 } from "./time";
import { clampRate, type PlaybackRate } from "./rates";

export interface StoredFile {
  position: number;
  volume: number;
  muted: boolean;
  rate: PlaybackRate;
  updatedAt: number;
}

export interface StoredPrefs {
  volume: number;
  muted: boolean;
  rate: PlaybackRate;
  captions: boolean;
  files: Record<string, StoredFile>;
}

export interface ResumeStore {
  prefs(): StoredPrefs;
  file(id: string): StoredFile | null;
  updateFile(
    id: string,
    patch: Partial<Omit<StoredFile, "updatedAt" | "rate">> & { rate?: number },
  ): void;
  setDefaults(patch: { volume?: number; muted?: boolean; rate?: number }): void;
  setCaptions(on: boolean): void;
  /** Drop one file's saved position and settings. */
  forget(id: string): void;
  /** Drop every file's saved position; keeps the default volume, mute, speed. */
  forgetAll(): void;
}

const MAX_FILES = 200;

export const RESUME_STORAGE_KEY = "glint.player.v1";
const LEGACY_RESUME_STORAGE_KEY = "lumen.player.v1";

type ResumeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Resume is per file. Volume, mute, and speed are stored on the file and also
 * remembered as the default for the next file that has no memory yet.
 * Positions under 5s, or within 10s of the end, are not resumed.
 */
export function resumePosition(saved: number | null | undefined, duration: number): number | null {
  if (saved == null || !Number.isFinite(saved)) return null;
  if (saved < 5) return null;
  if (Number.isFinite(duration) && duration > 0 && saved > duration - 10) return null;
  return saved;
}

export function createResumeStore(storage: ResumeStorage, key = RESUME_STORAGE_KEY): ResumeStore {
  if (key === RESUME_STORAGE_KEY) migrateLegacyResume(storage);
  let prefs = read(storage, key);

  const save = () => {
    try {
      storage.setItem(key, JSON.stringify(prefs));
    } catch {
      prefs = { ...prefs, files: prune(prefs.files, Math.floor(MAX_FILES / 2)) };
      try {
        storage.setItem(key, JSON.stringify(prefs));
      } catch {
        // Storage can be unavailable (private mode, full disk). Playback still works.
      }
    }
  };

  return {
    prefs: () => prefs,
    file(id) {
      return prefs.files[id] ?? null;
    },
    setDefaults(patch) {
      if (patch.volume != null && Number.isFinite(patch.volume)) {
        prefs = { ...prefs, volume: clamp01(patch.volume) };
      }
      if (patch.muted != null) prefs = { ...prefs, muted: patch.muted };
      if (patch.rate != null && Number.isFinite(patch.rate)) {
        prefs = { ...prefs, rate: clampRate(patch.rate) };
      }
      save();
    },
    updateFile(id, patch) {
      const previous = prefs.files[id];
      const next: StoredFile = {
        position: previous?.position ?? 0,
        volume: previous?.volume ?? prefs.volume,
        muted: previous?.muted ?? prefs.muted,
        rate: previous?.rate ?? prefs.rate,
        updatedAt: Date.now(),
      };
      if (patch.position != null && Number.isFinite(patch.position)) {
        next.position = Math.max(0, patch.position);
      }
      if (patch.volume != null && Number.isFinite(patch.volume)) {
        next.volume = clamp01(patch.volume);
        prefs = { ...prefs, volume: next.volume };
      }
      if (patch.muted != null) {
        next.muted = patch.muted;
        prefs = { ...prefs, muted: next.muted };
      }
      if (patch.rate != null && Number.isFinite(patch.rate)) {
        next.rate = clampRate(patch.rate);
        prefs = { ...prefs, rate: next.rate };
      }
      const files = prune({ ...prefs.files, [id]: next }, MAX_FILES);
      prefs = { ...prefs, files };
      save();
    },
    setCaptions(on) {
      prefs = { ...prefs, captions: on };
      save();
    },
    forget(id) {
      if (!(id in prefs.files)) return;
      const files = { ...prefs.files };
      delete files[id];
      prefs = { ...prefs, files };
      save();
    },
    forgetAll() {
      prefs = { ...prefs, files: {} };
      save();
    },
  };
}

export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = { ...initial };
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    key(index: number) {
      return Object.keys(data)[index] ?? null;
    },
    removeItem(key: string) {
      delete data[key];
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

function migrateLegacyResume(storage: ResumeStorage): void {
  try {
    if (storage.getItem(RESUME_STORAGE_KEY) != null) return;
    const legacy = storage.getItem(LEGACY_RESUME_STORAGE_KEY);
    if (legacy == null) return;
    storage.setItem(RESUME_STORAGE_KEY, legacy);
    storage.removeItem(LEGACY_RESUME_STORAGE_KEY);
  } catch {
    // Keep the old key if the renamed store cannot be written yet.
  }
}

function read(storage: Pick<Storage, "getItem">, key: string): StoredPrefs {
  const empty = defaultPrefs();
  const raw = storage.getItem(key);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    const files: Record<string, StoredFile> = {};
    if (parsed.files && typeof parsed.files === "object") {
      for (const [id, value] of Object.entries(parsed.files)) {
        const file = sanitizeFile(value);
        if (file) files[id] = file;
      }
    }
    return {
      volume: typeof parsed.volume === "number" ? clamp01(parsed.volume) : empty.volume,
      muted: typeof parsed.muted === "boolean" ? parsed.muted : empty.muted,
      rate: typeof parsed.rate === "number" ? clampRate(parsed.rate) : empty.rate,
      captions: typeof parsed.captions === "boolean" ? parsed.captions : empty.captions,
      files: prune(files, MAX_FILES),
    };
  } catch {
    return empty;
  }
}

function sanitizeFile(value: unknown): StoredFile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredFile>;
  if (typeof record.position !== "number" || !Number.isFinite(record.position)) return null;
  return {
    position: Math.max(0, record.position),
    volume: typeof record.volume === "number" ? clamp01(record.volume) : 1,
    muted: Boolean(record.muted),
    rate: typeof record.rate === "number" ? clampRate(record.rate) : 1,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
  };
}

function prune(files: Record<string, StoredFile>, max: number): Record<string, StoredFile> {
  const entries = Object.entries(files);
  if (entries.length <= max) return files;
  entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  return Object.fromEntries(entries.slice(entries.length - max));
}

function defaultPrefs(): StoredPrefs {
  return {
    volume: 1,
    muted: false,
    rate: 1,
    captions: true,
    files: {},
  };
}
