/**
 * What the update toast shows. Kept free of DOM and Tauri so the flow can be
 * unit tested: a silent check on startup, a manual check from the Help menu,
 * then download, install, and relaunch.
 */

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
}

export type DownloadEvent =
  | { event: "started"; data: { contentLength: number | null } }
  | { event: "progress"; data: { chunkLength: number } }
  | { event: "finished" };

export interface UpdaterApi {
  /** A newer version, or null when this one is the latest. */
  check(): Promise<UpdateInfo | null>;
  /** Download, verify, install, and relaunch. Resolves only if it did not relaunch. */
  install(onEvent: (event: DownloadEvent) => void): Promise<void>;
}

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; received: number; total: number | null }
  | { kind: "installing"; version: string }
  | { kind: "current"; version: string }
  | { kind: "failed"; step: "check" | "install"; version: string | null };

/** True while the download or installer is running; nothing else may start. */
export function isBusy(state: UpdateState): boolean {
  return state.kind === "downloading" || state.kind === "installing";
}

/** Download progress from 0 to 1, or null when the size is unknown. */
export function progressRatio(state: UpdateState): number | null {
  if (state.kind === "installing") return 1;
  if (state.kind !== "downloading" || !state.total || state.total <= 0) return null;
  return Math.min(1, Math.max(0, state.received / state.total));
}

/** Folds one download event into the downloading state. */
export function applyDownloadEvent(state: UpdateState, event: DownloadEvent): UpdateState {
  if (state.kind !== "downloading") return state;
  switch (event.event) {
    case "started":
      return { ...state, received: 0, total: event.data.contentLength ?? null };
    case "progress":
      return { ...state, received: state.received + Math.max(0, event.data.chunkLength) };
    case "finished":
      return { kind: "installing", version: state.version };
  }
}

/** "3.1 of 7.4 MB", "3.1 MB", or "" before anything arrived. */
export function formatProgress(state: UpdateState): string {
  if (state.kind !== "downloading" || state.received <= 0) return "";
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  if (state.total && state.total > 0) return `${mb(state.received)} of ${mb(state.total)} MB`;
  return `${mb(state.received)} MB`;
}

/**
 * Which state the toast shows. While a video is fullscreen, only a running
 * download stays on screen; anything else waits until fullscreen ends.
 */
export function visibleState(state: UpdateState, fullscreen: boolean): UpdateState {
  if (state.kind === "idle") return state;
  if (fullscreen && !isBusy(state)) return { kind: "idle" };
  return state;
}
