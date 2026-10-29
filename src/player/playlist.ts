/** Extensions the shell will offer; most play through Glint's bundled ffmpeg. */
export const VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "webm",
  "mkv",
  "mov",
  "avi",
  "ogv",
  "ogg",
  "mpeg",
  "mpg",
  "wmv",
  "flv",
  "ts",
  "m2ts",
  "mts",
  "vob",
  "3gp",
  "asf",
  "divx",
  "f4v",
] as const;

const VIDEO_SET = new Set<string>(VIDEO_EXTENSIONS);

export function isVideoFilename(filename: string): boolean {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  if (base.startsWith(".")) return false;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  return VIDEO_SET.has(base.slice(dot + 1).toLowerCase());
}

/** Case-insensitive natural order so `clip2` sorts before `clip10`. */
export function naturalCompare(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const leftDigit = isDigit(left.charCodeAt(i));
    const rightDigit = isDigit(right.charCodeAt(j));
    if (leftDigit && rightDigit) {
      const leftStart = i;
      const rightStart = j;
      while (i < left.length && isDigit(left.charCodeAt(i))) i += 1;
      while (j < right.length && isDigit(right.charCodeAt(j))) j += 1;
      const leftNum = left.slice(leftStart, i).replace(/^0+/, "") || "0";
      const rightNum = right.slice(rightStart, j).replace(/^0+/, "") || "0";
      if (leftNum.length !== rightNum.length) return leftNum.length - rightNum.length;
      if (leftNum !== rightNum) return leftNum < rightNum ? -1 : 1;
      continue;
    }
    if (left[i] !== right[j]) return left[i] < right[j] ? -1 : 1;
    i += 1;
    j += 1;
  }
  return left.length - right.length;
}

export function sortByFilename<T extends { filename: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => naturalCompare(a.filename, b.filename));
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}
