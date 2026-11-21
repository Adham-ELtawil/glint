import { MAX_TAGS_PER_VIDEO, mergeTags, parseTagInput, tagKey } from "../home/tags";
import { icon } from "./icons";

export interface TagEditRequest {
  /** The video's title, shown under the heading. */
  title: string;
  /** Its current tags. */
  tags: readonly string[];
  /** Ideas from the file name. */
  suggestions: readonly string[];
  /** Tags already used on other videos, most used first. */
  known: readonly string[];
}

/** How many of the user's other tags to offer for reuse. */
const KNOWN_SHOWN = 10;

/**
 * "Edit tags" for one video: chips with ×, a text box where Enter or a comma
 * adds what was typed, and suggestions to click. Save hands back the list;
 * Cancel, Esc or a click outside drop the changes.
 */
export class TagDialog {
  private scrim: HTMLElement | null = null;

  constructor(private readonly host: HTMLElement) {}

  get isOpen(): boolean {
    return this.scrim != null;
  }

  close(): void {
    this.scrim?.remove();
    this.scrim = null;
  }

  open(request: TagEditRequest, onSave: (tags: string[]) => void): void {
    this.close();
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let tags = mergeTags([], request.tags);

    // `glint-modal` tells the player's shortcuts to leave these keys alone.
    const scrim = el("div", "home-dialog tag-dialog glint-modal");
    const panel = el("div", "home-dialog-panel tag-dialog-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "tag-dialog-title");
    const heading = el("h2");
    heading.id = "tag-dialog-title";
    heading.textContent = "Edit tags";
    const subtitle = el("p", "tag-dialog-video");
    subtitle.textContent = request.title;
    subtitle.title = request.title;
    subtitle.dir = "auto";

    const field = el("div", "tag-field");
    const chips = el("div", "tag-field-chips");
    const input = el("input", "tag-input");
    input.type = "text";
    input.placeholder = "Add a tag";
    input.setAttribute("aria-label", "Add tags, separated by commas");
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dir = "auto";
    input.maxLength = 200;
    field.append(chips, input);
    const hint = el("p", "tag-hint");
    hint.textContent = "Separate tags with commas. Press Enter to add one.";

    const ideas = el("div", "tag-ideas");
    const row = el("div", "home-dialog-actions");
    const cancel = textButton("Cancel", "home-btn is-ghost");
    const save = textButton("Save", "home-btn is-primary");
    row.append(cancel, save);
    panel.append(heading, subtitle, field, hint, ideas, row);
    scrim.append(panel);

    const add = (values: readonly string[]) => {
      const next = mergeTags(tags, values);
      if (next.length === tags.length) return;
      tags = next;
      paint();
    };
    const remove = (key: string) => {
      tags = tags.filter((tag) => tagKey(tag) !== key);
      paint();
      input.focus({ preventScroll: true });
    };
    const commitInput = () => {
      const typed = parseTagInput(input.value);
      input.value = "";
      add(typed);
    };
    const finish = (keep: boolean) => {
      if (keep) commitInput();
      const result = tags;
      this.close();
      returnFocus?.focus({ preventScroll: true });
      if (keep) onSave(result);
    };

    const ideaChip = (tag: string) => {
      const button = el("button", "tag-idea");
      button.type = "button";
      button.dir = "auto";
      button.setAttribute("aria-label", `Add tag ${tag}`);
      button.innerHTML = icon("plus");
      const label = el("span");
      label.textContent = tag;
      button.append(label);
      button.addEventListener("click", () => {
        add([tag]);
        // Keep the keyboard on the ideas row; the clicked chip is gone now.
        const next = ideas.querySelector<HTMLElement>(".tag-idea");
        (next ?? input).focus({ preventScroll: true });
      });
      return button;
    };
    const ideaGroup = (title: string, values: readonly string[]) => {
      const group = el("div", "tag-idea-group");
      const label = el("span", "tag-idea-label");
      label.textContent = title;
      const list = el("div", "tag-idea-list");
      list.append(...values.map(ideaChip));
      group.append(label, list);
      return group;
    };

    const paint = () => {
      const have = new Set(tags.map(tagKey));
      chips.replaceChildren(
        ...tags.map((tag) => {
          const chip = el("span", "tag-chip");
          chip.dir = "auto";
          const text = el("span", "tag-chip-text");
          text.textContent = tag;
          const x = el("button", "tag-chip-remove");
          x.type = "button";
          x.setAttribute("aria-label", `Remove tag ${tag}`);
          x.innerHTML = icon("close");
          x.addEventListener("click", (event) => {
            event.stopPropagation();
            remove(tagKey(tag));
          });
          chip.append(text, x);
          return chip;
        }),
      );
      input.placeholder = tags.length > 0 ? "Add another" : "Add a tag";
      input.disabled = tags.length >= MAX_TAGS_PER_VIDEO;
      const suggested = request.suggestions.filter((tag) => !have.has(tagKey(tag)));
      const suggestedKeys = new Set(suggested.map(tagKey));
      const known = request.known
        .filter((tag) => !have.has(tagKey(tag)) && !suggestedKeys.has(tagKey(tag)))
        .slice(0, KNOWN_SHOWN);
      const groups: HTMLElement[] = [];
      if (suggested.length > 0) groups.push(ideaGroup("Suggested", suggested));
      if (known.length > 0) groups.push(ideaGroup("Your tags", known));
      ideas.replaceChildren(...groups);
      ideas.hidden = groups.length === 0;
    };

    field.addEventListener("pointerdown", (event) => {
      if (event.target === field || event.target === chips) {
        event.preventDefault();
        input.focus({ preventScroll: true });
      }
    });
    input.addEventListener("input", () => {
      // A comma (typed or pasted) finishes every tag before it.
      if (!/[,،;]/.test(input.value)) return;
      const parts = input.value.split(/[,،;]/);
      const rest = parts.pop() ?? "";
      add(parseTagInput(parts.join(",")));
      input.value = rest.trimStart();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (input.value.trim()) commitInput();
        else finish(true);
      } else if (event.key === "Backspace" && input.value === "" && tags.length > 0) {
        event.preventDefault();
        tags = tags.slice(0, -1);
        paint();
      }
    });
    cancel.addEventListener("click", () => finish(false));
    save.addEventListener("click", () => finish(true));
    scrim.addEventListener("pointerdown", (event) => {
      if (event.target === scrim) finish(false);
    });
    panel.addEventListener("keydown", (event) => {
      // Nothing typed here should reach the player or Home behind the dialog.
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Tab") {
        const focusable = [
          ...panel.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"),
        ];
        if (focusable.length === 0) return;
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        const step = event.shiftKey ? -1 : 1;
        const next = focusable[(index + step + focusable.length) % focusable.length];
        event.preventDefault();
        next?.focus();
      }
    });
    for (const type of ["keyup", "keypress"] as const) {
      panel.addEventListener(type, (event) => event.stopPropagation());
    }

    paint();
    this.scrim = scrim;
    this.host.append(scrim);
    input.focus({ preventScroll: true });
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function textButton(label: string, className: string): HTMLButtonElement {
  const node = el("button", className);
  node.type = "button";
  node.textContent = label;
  return node;
}
