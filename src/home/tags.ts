/**
 * Tags the user puts on videos, and tag ideas taken from a file name.
 *
 * Tags live in this browser profile's localStorage (inside the app's own data
 * folder), keyed by the same path form Home uses, and are never sent
 * anywhere. They are separate from watch history on purpose: clearing history
 * forgets what was watched, not how the user organised their videos.
 */
import { pathKey } from "./model";

export const TAGS_STORAGE_KEY = "glint.tags.v1";
/** Long enough for "Snowboarding with friends", short enough for a chip. */
export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS_PER_VIDEO = 30;
export const MAX_SUGGESTIONS = 8;

/** Trimmed, single-spaced, without a leading #, capped in length. */
export function normalizeTag(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim().replace(/^#+/, "").trim();
  return Array.from(text).slice(0, MAX_TAG_LENGTH).join("").trim();
}

/** The form two tags are compared in: "Trip", "TRIP" and "ｔｒｉｐ" are one tag. */
export function tagKey(tag: string): string {
  return normalizeTag(tag).normalize("NFKC").toLocaleLowerCase();
}

/** "Snowboarding, Trip، family" → three tags. Commas (and the Arabic comma) separate. */
export function parseTagInput(text: string): string[] {
  return mergeTags([], text.split(/[,،;]/));
}

/** `existing` followed by any `added` tags it doesn't have yet. */
export function mergeTags(existing: readonly string[], added: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...existing, ...added]) {
    const tag = normalizeTag(raw);
    const key = tagKey(tag);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, MAX_TAGS_PER_VIDEO);
}

/** Words that say nothing about a video on their own. */
const STOPWORDS = new Set(
  // English
  (
    "a an and are as at be been but by can could did do does for from had has have he her " +
    "his how i if in into is it its just me my no not of off on or our out over she so " +
    "than that the their them then there these they this to too up us vs was we were what " +
    "when where which who why will with without you your yours " +
    "about after again all also am any before being both each few get got here him more most " +
    "only other own same should some such through under until very while would " +
    // File-name filler
    "video videos vid clip clips movie film part episode ep full new old final copy edit " +
    "edited untitled img mvi dsc pxl gopr screen recording record capture sample " +
    // Arabic
    "في من إلى الى على عن مع و أو او ثم يا ده دي دا دى هذا هذه ذلك تلك هو هي هم انا أنا " +
    "احنا إحنا انت أنت انتي كان كانت يكون مش لا ما لم لن قد كل بعض بين عند لما اللي الذي " +
    "التي الذين بس كمان فيديو مقطع جزء حلقة"
  ).split(/\s+/),
);

/** Release-name and codec noise: 1080p, x264, WEBRip and friends. */
const JUNK = new Set(
  (
    "webrip webdl web dl bluray blu ray brrip bdrip hdrip dvdrip dvdscr hdtv hdcam cam ts " +
    "hevc avc aac ac3 eac3 dts dd ddp atmos truehd flac mp3 opus hdr sdr dv dovi remux " +
    "proper repack extended unrated uncut limited internal yify yts rarbg ettv eztv " +
    "psa tgx galaxyrg amzn nf dsnp hmax atvp hulu uhd fhd hd sd xvid divx mkv mp4 avi " +
    "mov wmv flv webm m4v mpg mpeg ts m2ts subs sub subbed dubbed dub eng multi dual " +
    "audio esub hc"
  ).split(/\s+/),
);

/**
 * Tag ideas from a file name, in the order the words appear: the extension,
 * numbers and anything with a digit in it (1080p, x264, S01E02, 2014), codec
 * and release noise, and filler words are dropped. Lower-case or shouting words
 * are shown capitalised; mixed case like "iPhone" is kept as written.
 * Tags in `skip` (the video's current ones) are left out.
 */
export function suggestTags(filename: string, skip: readonly string[] = []): string[] {
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 && filename.length - dot <= 6 ? filename.slice(0, dot) : filename;
  const seen = new Set(skip.map(tagKey));
  const out: string[] = [];
  const keep = (word: string) => {
    if (/\p{N}/u.test(word) || Array.from(word).length < 2) return false;
    const key = tagKey(word);
    return !STOPWORDS.has(key) && !JUNK.has(key);
  };
  for (const match of stem.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    // Judge "WEBRip" whole before splitting camelCase words apart.
    if (!keep(match[0])) continue;
    const parts = match[0]
      // beachDay → beach Day, HTMLParser → HTML Parser; "iPhone" stays whole.
      .replace(/(?<=\p{Ll}{2})(?=\p{Lu})/gu, " ")
      .replace(/(?<=\p{Lu})(?=\p{Lu}\p{Ll}{2})/gu, " ")
      .split(" ");
    for (const word of parts) {
      const key = tagKey(word);
      if (!keep(word) || seen.has(key)) continue;
      seen.add(key);
      out.push(display(word));
      if (out.length >= MAX_SUGGESTIONS) return out;
    }
  }
  return out;
}

function display(word: string): string {
  const lower = word.toLocaleLowerCase();
  const upper = word.toLocaleUpperCase();
  // Scripts without case (Arabic) have lower === upper; keep them as typed.
  if (lower === upper) return word;
  const shouting = word === upper && Array.from(word).length > 3;
  if (word !== lower && !shouting) return word;
  const [first = "", ...rest] = Array.from(lower);
  return first.toLocaleUpperCase() + rest.join("");
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagStore {
  /** The video's tags, in the order the user added them. */
  get(path: string): string[];
  /** Replace the video's tags; an empty list forgets the video. */
  set(path: string, tags: readonly string[]): void;
  /** Every tag in use, most used first, then alphabetically. */
  all(): TagCount[];
  /** pathKey → tags, for Home. */
  snapshot(): ReadonlyMap<string, readonly string[]>;
  subscribe(listener: () => void): () => void;
}

interface TagRecord {
  path: string;
  tags: string[];
  updatedAt: number;
}

type TagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createTagStore(storage: TagStorage, key = TAGS_STORAGE_KEY): TagStore {
  const files = read(storage, key);
  const listeners = new Set<() => void>();
  let cache: Map<string, readonly string[]> | null = null;

  const save = () => {
    cache = null;
    try {
      if (files.size === 0) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify({ files: Object.fromEntries(files) }));
    } catch {
      // Storage can be full or unavailable; the tags still hold for this session.
    }
    for (const listener of listeners) listener();
  };

  return {
    get: (path) => [...(files.get(pathKey(path))?.tags ?? [])],
    set(path, tags, now = Date.now()) {
      const id = pathKey(path);
      if (!id) return;
      const clean = mergeTags([], tags);
      const previous = files.get(id);
      if (previous && same(previous.tags, clean)) return;
      if (!previous && clean.length === 0) return;
      if (clean.length === 0) files.delete(id);
      else files.set(id, { path, tags: clean, updatedAt: now });
      save();
    },
    all() {
      const counts = new Map<string, TagCount>();
      for (const record of files.values()) {
        for (const tag of record.tags) {
          const k = tagKey(tag);
          const known = counts.get(k);
          if (known) known.count += 1;
          else counts.set(k, { tag, count: 1 });
        }
      }
      return [...counts.values()].sort(
        (a, b) =>
          b.count - a.count || a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }),
      );
    },
    snapshot() {
      if (!cache) cache = new Map([...files].map(([id, record]) => [id, record.tags]));
      return cache;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

function read(storage: Pick<Storage, "getItem">, key: string): Map<string, TagRecord> {
  const out = new Map<string, TagRecord>();
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return out;
  }
  if (!raw) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    const files =
      parsed && typeof parsed === "object" ? (parsed as { files?: unknown }).files : null;
    if (!files || typeof files !== "object") return out;
    for (const value of Object.values(files as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      const path = typeof record.path === "string" ? record.path : "";
      const tags = Array.isArray(record.tags)
        ? mergeTags(
            [],
            record.tags.filter((tag): tag is string => typeof tag === "string"),
          )
        : [];
      if (!path || tags.length === 0) continue;
      const updatedAt =
        typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
          ? record.updatedAt
          : 0;
      out.set(pathKey(path), { path, tags, updatedAt });
    }
  } catch {
    return new Map();
  }
  return out;
}
