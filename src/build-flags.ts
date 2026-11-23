/**
 * Reads the GLINT_STORE build variable: only "1" means the Microsoft Store
 * build. Used by vite.config.ts, so it imports nothing.
 */
export function isStoreBuild(value: string | undefined): boolean {
  return value?.trim() === "1";
}
