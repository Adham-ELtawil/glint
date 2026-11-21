import {
  MIN_WATCH_MS,
  STAR_STORAGE_KEY,
  loadStarState,
  markDone,
  markShown,
  recordWatchSession,
  shouldShowStar,
  type StarDone,
  type StarState,
} from "./schedule";

export interface StarPromptOptions {
  /** Shows or hides the card. `preview` is true for the hidden test shortcut. */
  render(visible: boolean, preview: boolean): void;
  /** Opens the GitHub page in the default browser. */
  openRepo(): void;
  now?: () => number;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/**
 * Runs the "star Glint on GitHub" card: measures real playback in this launch,
 * keeps the saved record, and decides at calm moments (Home, a finished video)
 * whether to show the card. It appears at most once per launch, never while
 * the update card or fullscreen covers it, and leaves when a video starts.
 */
export class StarPromptController {
  private state: StarState | null;
  private readonly now: () => number;
  private watchedMs = 0;
  private playingSince: number | null = null;
  private counted = false;
  private shownThisLaunch = false;
  private open = false;
  private previewing = false;
  private covered = false;

  constructor(
    private readonly storage: Storage,
    private readonly options: StarPromptOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
    try {
      const raw = storage.getItem(STAR_STORAGE_KEY);
      this.state = loadStarState(raw, this.now());
      if (raw == null) this.save();
    } catch {
      // Without storage Glint can't remember an answer, so it never asks.
      this.state = null;
    }
  }

  get visible(): boolean {
    return this.open && !this.covered;
  }

  /** Called on every player state change. */
  notePlayback(playing: boolean): void {
    const now = this.now();
    if (playing && this.open) this.close();
    if (this.playingSince != null) {
      this.watchedMs += Math.max(0, now - this.playingSince);
      this.playingSince = playing ? now : null;
    } else if (playing) {
      this.playingSince = now;
    }
    if (!this.counted && this.watchedMs >= MIN_WATCH_MS && this.state) {
      this.counted = true;
      this.state = recordWatchSession(this.state, now);
      this.save();
    }
  }

  /** The update card or fullscreen is (or is no longer) in the way. */
  setCovered(covered: boolean): void {
    if (covered === this.covered) return;
    const was = this.visible;
    this.covered = covered;
    if (was !== this.visible) this.paint();
  }

  /** A calm moment: shows the card if this launch and the schedule allow it. */
  offer(): boolean {
    const state = this.state;
    if (!state || this.open || this.covered || this.shownThisLaunch || !this.counted) return false;
    const now = this.now();
    if (!shouldShowStar(state, now)) return false;
    this.state = markShown(state, now);
    this.save();
    this.shownThisLaunch = true;
    this.previewing = false;
    this.open = true;
    this.paint();
    return true;
  }

  /** Shows the card regardless of the schedule; answers are not saved. */
  preview(): void {
    this.previewing = true;
    this.open = true;
    this.paint();
  }

  star(): void {
    this.options.openRepo();
    this.finish("starred");
  }

  never(): void {
    this.finish("never");
  }

  /** "Not now", ×, or Esc. Showing the card already snoozed it. */
  notNow(): void {
    this.close();
  }

  /** Help → Star Glint on GitHub. */
  openFromMenu(): void {
    this.options.openRepo();
    this.finish("starred");
  }

  private finish(reason: StarDone): void {
    if (!this.previewing && this.state) {
      this.state = markDone(this.state, reason);
      this.save();
    }
    this.close();
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.paint();
    this.previewing = false;
  }

  private paint(): void {
    this.options.render(this.visible, this.previewing);
  }

  private save(): void {
    if (!this.state) return;
    try {
      this.storage.setItem(STAR_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Not remembering is fine; at worst the card follows the rule again.
    }
  }
}
