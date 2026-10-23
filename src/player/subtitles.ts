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
