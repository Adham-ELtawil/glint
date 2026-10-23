import { parseTimestamp } from "./time";

export interface Chapter {
  start: number;
  title: string;
}

export function parseChapters(text: string | null, format: "json" | "vtt" | null): Chapter[] {
  if (!text || !format) return [];
  const chapters = format === "json" ? parseJsonChapters(text) : parseVttChapters(text);
  chapters.sort((a, b) => a.start - b.start);
  return chapters;
}

export function chapterAt(chapters: readonly Chapter[], time: number): Chapter | null {
  let current: Chapter | null = null;
  for (const chapter of chapters) {
    if (chapter.start <= time + 0.05) current = chapter;
    else break;
  }
  return current;
}

function parseJsonChapters(text: string): Chapter[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { chapters?: unknown }).chapters)
      ? (parsed as { chapters: unknown[] }).chapters
      : null;
  if (!list) return [];
  const chapters: Chapter[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { start?: unknown; time?: unknown; title?: unknown; name?: unknown };
    const title = stringField(record.title) ?? stringField(record.name);
    const start = timeField(record.start ?? record.time);
    if (!title || start == null) continue;
    chapters.push({ start, title });
  }
  return chapters;
}

function parseVttChapters(text: string): Chapter[] {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const chapters: Chapter[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("NOTE") && !line.startsWith("WEBVTT"));
    const timing = lines.find((line) => line.includes("-->"));
    if (!timing) continue;
    const startRaw = timing.split("-->")[0]?.trim() ?? "";
    const start = parseTimestamp(startRaw.replace(",", "."));
    if (start == null) continue;
    const title = lines
      .slice(lines.indexOf(timing) + 1)
      .join(" ")
      .trim();
    if (!title) continue;
    chapters.push({ start, title });
  }
  return chapters;
}

function stringField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function timeField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") return parseTimestamp(value);
  return null;
}
