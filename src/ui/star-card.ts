import { isTypingTarget } from "../player/shortcuts";
import { brandMark } from "./icons";

export interface StarCardActions {
  star(): void;
  notNow(): void;
  never(): void;
}

const STAR_ICON =
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
  `<path fill="currentColor" d="M12 2.8l2.83 5.73 6.33.92-4.58 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3-4.58-4.46 6.33-.92z"/></svg>`;

const CLOSE_ICON =
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
  `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>`;

/**
 * A small "star Glint on GitHub" card in the same corner and style as the
 * update card (the two never show together). It never takes focus or blocks
 * the player; Esc or × close it like "Not now".
 */
export class StarCard {
  readonly root: HTMLElement;

  constructor(private readonly actions: StarCardActions) {
    this.root = el("section", "update-toast star-card");
    this.root.hidden = true;
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "polite");
    this.root.setAttribute("aria-label", "Star Glint on GitHub");
    const mark = el("div", "update-toast-mark");
    mark.innerHTML = brandMark("glint-star-g");
    const body = el("div", "update-toast-body");
    const title = el("p", "update-toast-title star-card-title");
    title.textContent = "Enjoying Glint?";
    const text = el("p", "update-toast-text star-card-text");
    text.textContent =
      "A GitHub star is a small act that means a lot, and it helps others find Glint.";
    const close = button("", "star-card-close", () => this.actions.notNow());
    close.setAttribute("aria-label", "Close");
    close.title = "Close (Esc)";
    close.innerHTML = CLOSE_ICON;
    const row = el("div", "update-toast-actions star-card-actions");
    const never = button("Don't show again", "star-card-never", () => this.actions.never());
    const later = button("Not now", "update-toast-later star-card-later", () =>
      this.actions.notNow(),
    );
    const star = button("", "update-toast-primary star-card-primary", () => this.actions.star());
    star.innerHTML = `${STAR_ICON}<span>Star on GitHub</span>`;
    row.append(never, later, star);
    body.append(title, text, row);
    this.root.append(close, mark, body);
    // Keep clicks and keys inside the card away from the player behind it.
    for (const type of ["click", "dblclick", "keydown"]) {
      this.root.addEventListener(type, (event) => {
        if (type === "keydown" && (event as KeyboardEvent).key === "Escape") {
          event.preventDefault();
          this.actions.notNow();
        }
        event.stopPropagation();
      });
    }
    window.addEventListener("keydown", (event) => {
      if (this.root.hidden || event.key !== "Escape" || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      this.actions.notNow();
    });
  }

  render(visible: boolean, preview = false): void {
    const wasHidden = this.root.hidden;
    this.root.hidden = !visible;
    if (preview && visible) this.root.dataset.preview = "true";
    else delete this.root.dataset.preview;
    if (visible && wasHidden) {
      this.root.classList.remove("is-entering");
      void this.root.offsetWidth;
      this.root.classList.add("is-entering");
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

function button(label: string, className: string, run: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  node.addEventListener("click", () => run());
  return node;
}
