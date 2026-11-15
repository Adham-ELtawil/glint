/**
 * Convert SubRip to WebVTT so the webview `<track>` element can display it.
 * A string that is already WebVTT is returned unchanged.
 */
export function srtToVtt(input: string): string {
  const text = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (/^WEBVTT\b/.test(text)) {
    return text.endsWith("\n") ? text : `${text}\n`;
  }

  const cues: string[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (lines.length === 0) continue;
    let start = 0;
    if (/^\d+$/.test(lines[0].trim()) && lines.length > 1) start = 1;
    const body = lines.slice(start);
    const timingIndex = body.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) continue;
    const timing = toVttTiming(body[timingIndex]);
    if (!timing) continue;
    const payload = body
      .slice(timingIndex + 1)
      .join("\n")
      .replace(/\s+$/g, "");
    if (!payload.trim()) continue;
    cues.push(`${timing}\n${payload}`);
  }

  return `WEBVTT\n\n${cues.join("\n\n")}${cues.length > 0 ? "\n" : ""}`;
}

function toVttTiming(line: string): string | null {
  const match = line.match(
    /(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})(.*)/,
  );
  if (!match) return null;
  const start = normalizeStamp(match[1]);
  const end = normalizeStamp(match[2]);
  const settings = match[3].trim();
  const vttSettings = settings
    .split(/\s+/)
    .filter((token) => token.includes(":") && !/^X\d+:/i.test(token) && !/^Y\d+:/i.test(token))
    .join(" ");
  return `${start} --> ${end}${vttSettings ? ` ${vttSettings}` : ""}`;
}

function normalizeStamp(stamp: string): string {
  const [clock, fraction] = stamp.replace(",", ".").split(".");
  const parts = clock.split(":");
  const hours = parts[0].padStart(2, "0");
  return `${hours}:${parts[1]}:${parts[2]}.${fraction}`;
}

export function isSubtitleFilename(filename: string): boolean {
  return subtitleFormat(filename) != null;
}

export function subtitleFormat(filename: string): "srt" | "vtt" | null {
  const base = (filename.split(/[/\\]/).pop() ?? filename).toLowerCase();
  if (base.endsWith(".chapters.srt") || base.endsWith(".chapters.vtt")) return null;
  if (base.endsWith(".srt")) return "srt";
  if (base.endsWith(".vtt")) return "vtt";
  return null;
}

/** Subtitle delay limits and step, in seconds (G / H, like VLC). */
export const SUBTITLE_DELAY_STEP = 0.1;
export const SUBTITLE_DELAY_MAX = 60;

/** Keeps a delay on the 0.1 s grid and within range, so repeated steps don't drift. */
export function clampSubtitleDelay(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const limited = Math.min(SUBTITLE_DELAY_MAX, Math.max(-SUBTITLE_DELAY_MAX, seconds));
  const rounded = Math.round(limited * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** "+0.3 s", "\u22120.5 s", "0 s": the label shown on screen. */
export function formatSubtitleDelay(seconds: number): string {
  const value = clampSubtitleDelay(seconds);
  if (value === 0) return "0 s";
  const sign = value > 0 ? "+" : "\u2212";
  return `${sign}${Math.abs(value).toFixed(1)} s`;
}

const CUE_TIMING =
  /^(\s*)((?:\d+:)?\d{1,2}:\d{2}\.\d{3})(\s+-->\s+)((?:\d+:)?\d{1,2}:\d{2}\.\d{3})(.*)$/;

function parseStamp(stamp: string): number {
  const parts = stamp.split(":");
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatStamp(total: number): string {
  const ms = Math.max(0, Math.round(total * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

/**
 * Moves every cue in a WebVTT document by `offset` seconds (positive = later).
 * Cues that would end before 0 are dropped; ones that would start before 0
 * start at 0. Header, NOTE and STYLE blocks and cue settings are kept.
 */
export function shiftVtt(vtt: string, offset: number): string {
  const delta = clampSubtitleDelay(offset);
  if (delta === 0) return vtt;
  const blocks = vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const kept: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const index = lines.findIndex((line) => CUE_TIMING.test(line));
    if (index < 0 || /^(NOTE|STYLE|REGION)\b/.test(lines[0])) {
      kept.push(block);
      continue;
    }
    const match = lines[index].match(CUE_TIMING)!;
    const start = parseStamp(match[2]) + delta;
    const end = parseStamp(match[4]) + delta;
    if (end <= 0) continue;
    lines[index] =
      `${match[1]}${formatStamp(Math.max(0, start))}${match[3]}${formatStamp(end)}${match[5]}`;
    kept.push(lines.join("\n"));
  }
  return kept.join("\n\n");
}
