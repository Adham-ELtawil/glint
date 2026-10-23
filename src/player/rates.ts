export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export function clampRate(rate: number): PlaybackRate {
  if (!Number.isFinite(rate)) return 1;
  let best: PlaybackRate = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of PLAYBACK_RATES) {
    const distance = Math.abs(candidate - rate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function stepRate(current: number, direction: -1 | 1): PlaybackRate {
  const snapped = clampRate(current);
  const index = PLAYBACK_RATES.indexOf(snapped);
  const next = Math.min(PLAYBACK_RATES.length - 1, Math.max(0, index + direction));
  return PLAYBACK_RATES[next];
}

export function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || Math.abs(rate - 1) < 0.001) return "Normal";
  const text = Number.isInteger(rate) ? rate.toFixed(0) : String(rate);
  return text;
}
