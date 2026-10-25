/** Text helpers for home-screen cards. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** "Just now", "5 minutes ago", "Yesterday", "3 weeks ago", like YouTube. */
export function relativeTime(then: number, now = Date.now()): string {
  if (!Number.isFinite(then) || then <= 0) return "";
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return plural(Math.floor(diff / HOUR), "hour");
  if (diff < 2 * DAY) return "Yesterday";
  if (diff < WEEK) return plural(Math.floor(diff / DAY), "day");
  if (diff < MONTH) return plural(Math.floor(diff / WEEK), "week");
  if (diff < YEAR) return plural(Math.floor(diff / MONTH), "month");
  return plural(Math.floor(diff / YEAR), "year");
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

/** Duration badge text: 0:42, 12:05, 1:02:09. */
export function badgeTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** 980 KB, 14 MB, 1.2 GB (decimal units, as Explorer's size column rounds). */
export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} bytes`;
  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits).replace(/\.0$/, "")} ${units[unit]}`;
}

export function extensionLabel(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return "VIDEO";
  return filename.slice(dot + 1).toUpperCase();
}

/** The filename without its extension, as the card title. */
export function titleOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
