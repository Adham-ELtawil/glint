/** YouTube-style clock: `m:ss`, or `h:mm:ss` once the video reaches an hour. */
export function formatTime(seconds: number, forceHours = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const ss = secs.toString().padStart(2, "0");
  if (hours > 0 || forceHours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

export function formatPair(current: number, duration: number): { current: string; total: string } {
  const forceHours = Number.isFinite(duration) && duration >= 3600;
  return {
    current: formatTime(current, forceHours),
    total: Number.isFinite(duration) && duration > 0 ? formatTime(duration, forceHours) : "0:00",
  };
}

/** Parse `m:ss`, `h:mm:ss`, or a plain number of seconds. */
export function parseTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const match = trimmed.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? Number(match[4].padEnd(3, "0")) / 1000 : 0;
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

export function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || time < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return time;
  return Math.min(time, duration);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
