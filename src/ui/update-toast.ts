import { brandMark } from "./icons";
import { formatProgress, progressRatio, type UpdateState } from "../update/model";

export interface UpdateToastActions {
  update(): void;
  later(): void;
  retry(): void;
}

interface Copy {
  title: string;
  text: string;
  primary?: { label: string; run: () => void };
  secondary?: { label: string; run: () => void };
  progress: boolean;
}

/**
 * The update card in the top-right corner, under the menu bar, so it never
 * covers the player controls. Visibility is the `hidden` attribute only; the
 * slide-in is decoration, skipped when the system asks for reduced motion.
 */
export class UpdateToast {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly track: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly buttons: HTMLElement;
  private shownStep = "idle";

  constructor(private readonly actions: UpdateToastActions) {
    this.root = el("section", "update-toast");
    this.root.hidden = true;
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "polite");
    this.root.setAttribute("aria-label", "Glint update");
    const mark = el("div", "update-toast-mark");
    mark.innerHTML = brandMark("glint-update-g");
    const body = el("div", "update-toast-body");
    this.title = el("p", "update-toast-title");
    this.text = el("p", "update-toast-text");
    this.track = el("div", "update-toast-track");
    this.track.setAttribute("role", "progressbar");
    this.track.setAttribute("aria-valuemin", "0");
    this.track.setAttribute("aria-valuemax", "100");
    this.bar = el("div", "update-toast-bar");
    this.track.append(this.bar);
    this.buttons = el("div", "update-toast-actions");
    body.append(this.title, this.text, this.track, this.buttons);
    this.root.append(mark, body);
    // Keep clicks and keys inside the card away from the player behind it.
    for (const type of ["click", "dblclick", "keydown"]) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }
  }

  render(state: UpdateState): void {
    const copy = this.copyFor(state);
    if (!copy) {
      this.root.hidden = true;
      this.shownStep = "idle";
      return;
    }
    const wasHidden = this.root.hidden;
    this.title.textContent = copy.title;
    this.text.textContent = copy.text;
    this.text.hidden = copy.text === "";
    this.track.hidden = !copy.progress;
    const ratio = progressRatio(state);
    this.track.classList.toggle("is-unknown", ratio == null);
    this.bar.style.width = ratio == null ? "" : `${(ratio * 100).toFixed(1)}%`;
    if (ratio == null) this.track.removeAttribute("aria-valuenow");
    else this.track.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    // Rebuild buttons only when the step changes, so focus survives progress.
    const step = state.kind === "failed" ? `failed-${state.step}` : state.kind;
    if (step !== this.shownStep) {
      this.buttons.replaceChildren();
      if (copy.secondary) this.buttons.append(button(copy.secondary, "update-toast-later"));
      if (copy.primary) this.buttons.append(button(copy.primary, "update-toast-primary"));
    }
    this.buttons.hidden = !copy.primary && !copy.secondary;
    this.root.dataset.kind = state.kind;
    this.shownStep = step;
    this.root.hidden = false;
    if (wasHidden) {
      this.root.classList.remove("is-entering");
      void this.root.offsetWidth;
      this.root.classList.add("is-entering");
    }
  }

  private copyFor(state: UpdateState): Copy | null {
    const later = { label: "Later", run: () => this.actions.later() };
    switch (state.kind) {
      case "idle":
        return null;
      case "checking":
        return { title: "Checking for updates…", text: "", progress: false };
      case "available":
        return {
          title: `Glint ${state.version} is available`,
          text: "Glint restarts to finish. Your place is saved.",
          primary: { label: "Update", run: () => this.actions.update() },
          secondary: later,
          progress: false,
        };
      case "downloading": {
        const ratio = progressRatio(state);
        const amount = formatProgress(state);
        const percent = ratio == null ? "" : `${Math.round(ratio * 100)}%`;
        return {
          title: `Downloading Glint ${state.version}…`,
          text: [percent, amount].filter(Boolean).join(" · ") || "Starting the download",
          progress: true,
        };
      }
      case "installing":
        return {
          title: `Installing Glint ${state.version}…`,
          text: "Glint will restart in a moment.",
          progress: true,
        };
      case "current":
        return {
          title: "You're up to date",
          text: `Glint ${state.version} is the latest version.`,
          progress: false,
        };
      case "failed":
        if (state.step === "check") {
          return {
            title: "Couldn't check for updates",
            text: "Check your internet connection and try again.",
            primary: { label: "Try again", run: () => this.actions.retry() },
            secondary: { label: "Close", run: () => this.actions.later() },
            progress: false,
          };
        }
        return {
          title: "Couldn't install the update",
          text: `Glint ${state.version} couldn't be downloaded or verified. Nothing was changed.`,
          primary: { label: "Try again", run: () => this.actions.retry() },
          secondary: later,
          progress: false,
        };
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(action: { label: string; run: () => void }, className: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = action.label;
  node.addEventListener("click", () => action.run());
  return node;
}
