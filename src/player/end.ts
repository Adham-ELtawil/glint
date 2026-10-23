/**
 * Playback has finished, or the playhead was placed on the final instant.
 * A pause a few milliseconds earlier does not count — that is still the video.
 */
export function reachedEnd(currentTime: number, duration: number, ended: boolean): boolean {
  if (ended) return true;
  if (!(duration > 0) || !Number.isFinite(currentTime)) return false;
  return currentTime >= duration - 0.001;
}
