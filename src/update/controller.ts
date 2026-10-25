import {
  applyDownloadEvent,
  checkFailureOf,
  isBusy,
  visibleState,
  type UpdateState,
  type UpdaterApi,
} from "./model";

/** The startup check waits so it never competes with opening a video. */
export const AUTO_CHECK_DELAY_MS = 5_000;
/** "You're up to date" disappears on its own. */
export const CURRENT_HIDE_MS = 4_000;

export interface UpdateControllerOptions {
  currentVersion: string;
  render: (state: UpdateState) => void;
  /** Called right before the installer may quit the app. */
  beforeInstall?: () => void;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

/**
 * Runs the update flow. Startup checks are silent: if the check fails (offline,
 * GitHub unreachable) or Glint is up to date, nothing is shown. A manual check
 * always answers. "Later" hides the offer until the next launch or manual check.
 */
export class UpdateController {
  private state: UpdateState = { kind: "idle" };
  private fullscreen = false;
  private run = 0;
  private hideTimer = 0;
  private readonly setTimer: (fn: () => void, ms: number) => number;
  private readonly clearTimer: (id: number) => void;

  constructor(
    private readonly api: UpdaterApi,
    private readonly options: UpdateControllerOptions,
  ) {
    this.setTimer = options.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));
  }

  get current(): UpdateState {
    return this.state;
  }

  /** Schedules the silent startup check. */
  scheduleAutoCheck(delayMs = AUTO_CHECK_DELAY_MS): void {
    this.setTimer(() => void this.check(false), delayMs);
  }

  async check(manual: boolean): Promise<void> {
    if (isBusy(this.state)) return;
    // A silent check never replaces something already on screen.
    if (!manual && this.state.kind !== "idle") return;
    const run = ++this.run;
    if (manual) this.set({ kind: "checking" });
    let found;
    try {
      found = await this.api.check();
    } catch (error) {
      if (run !== this.run) return;
      console.warn("Update check failed:", error);
      this.set(
        manual
          ? { kind: "failed", step: "check", version: null, reason: checkFailureOf(error) }
          : { kind: "idle" },
      );
      return;
    }
    if (run !== this.run) return;
    if (found) this.set({ kind: "available", version: found.version });
    else if (manual) {
      this.set({ kind: "current", version: this.options.currentVersion });
      this.hideTimer = this.setTimer(() => {
        if (this.state.kind === "current") this.set({ kind: "idle" });
      }, CURRENT_HIDE_MS);
    } else this.set({ kind: "idle" });
  }

  async install(): Promise<void> {
    const state = this.state;
    const version =
      state.kind === "available" || (state.kind === "failed" && state.step === "install")
        ? state.version
        : null;
    if (!version) return;
    const run = ++this.run;
    this.set({ kind: "downloading", version, received: 0, total: null });
    this.options.beforeInstall?.();
    try {
      await this.api.install((event) => {
        if (run === this.run) this.set(applyDownloadEvent(this.state, event));
      });
    } catch (error) {
      if (run !== this.run) return;
      console.warn("Update failed:", error);
      this.set({ kind: "failed", step: "install", version });
      return;
    }
    // Resolving means the app was not relaunched (it normally is). Leave the
    // "Restarting" state so the user can close Glint themselves.
    if (run === this.run && this.state.kind === "downloading") {
      this.set({ kind: "installing", version });
    }
  }

  /** Retry whatever failed. */
  retry(): void {
    const state = this.state;
    if (state.kind !== "failed") return;
    if (state.step === "install") void this.install();
    else void this.check(true);
  }

  /** Hide the toast. A running download can't be dismissed. */
  dismiss(): void {
    if (isBusy(this.state)) return;
    this.run++;
    this.set({ kind: "idle" });
  }

  setFullscreen(on: boolean): void {
    if (on === this.fullscreen) return;
    this.fullscreen = on;
    this.paint();
  }

  private set(state: UpdateState): void {
    this.clearTimer(this.hideTimer);
    this.state = state;
    this.paint();
  }

  private paint(): void {
    this.options.render(visibleState(this.state, this.fullscreen));
  }
}
