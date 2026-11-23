/**
 * Where this build of Glint is distributed, fixed when it is built.
 *
 * The regular build (GitHub releases) updates itself. The Microsoft Store
 * build is made with GLINT_STORE=1 and has no updater: the Store installs
 * updates, so the startup check, "Check for updates…" and the update card are
 * left out. The What's new card after an update stays in both.
 */

import type { UpdaterApi } from "./update/model";

declare const __GLINT_STORE__: boolean;

/** True in the Microsoft Store build (vite.config.ts sets it from GLINT_STORE). */
export const STORE_BUILD: boolean = typeof __GLINT_STORE__ === "boolean" && __GLINT_STORE__;

/** Whether Glint checks for and installs its own updates. */
export function selfUpdates(native: boolean, store: boolean = STORE_BUILD): boolean {
  return native && !store;
}

/**
 * The updater of the Store build: never finds an update and cannot install
 * one. Only the What's new card uses the update controller there.
 */
export const storeUpdater: UpdaterApi = {
  check: async () => null,
  install: async () => {
    throw new Error("The Microsoft Store installs Glint's updates.");
  },
};
