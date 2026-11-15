import { changelogSection } from "./notes";

/** The version whose "What's new" was last shown (or the first one installed). */
export const LAST_VERSION_KEY = "glint.lastVersion";
/** Saved by the resume store; its presence means Glint was used before. */
const EXISTING_USER_KEY = "glint.player.v1";

export interface WhatsNew {
  version: string;
  notes: string;
}

/** -1, 0 or 1, comparing dotted numeric versions ("0.2.10" > "0.2.9"). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split(/[.+-]/).map((p) => Number.parseInt(p, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * What to show once after an update, from the changelog bundled with this
 * version, and records that it was shown. A fresh install shows nothing.
 * Versions before 0.2.1 didn't record their version, so a missing record
 * with saved player data counts as an update.
 */
export function takeWhatsNew(
  storage: Pick<Storage, "getItem" | "setItem">,
  currentVersion: string,
  changelog: string,
): WhatsNew | null {
  let last: string | null = null;
  let existing = false;
  try {
    last = storage.getItem(LAST_VERSION_KEY);
    existing = storage.getItem(EXISTING_USER_KEY) != null;
    storage.setItem(LAST_VERSION_KEY, currentVersion);
  } catch {
    return null;
  }
  const updated = last == null ? existing : compareVersions(currentVersion, last) > 0;
  if (!updated) return null;
  const notes = changelogSection(changelog, currentVersion);
  return notes ? { version: currentVersion, notes } : null;
}
