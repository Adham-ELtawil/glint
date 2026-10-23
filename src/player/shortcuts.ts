export type ShortcutAction =
  | { type: "toggle-play" }
  | { type: "seek"; delta: number }
  | { type: "seek-ratio"; ratio: number }
  | { type: "seek-start" }
  | { type: "seek-end" }
  | { type: "volume"; delta: number }
  | { type: "toggle-mute" }
  | { type: "toggle-fullscreen" }
  | { type: "toggle-captions" }
  | { type: "toggle-theater" }
  | { type: "cycle-rate"; direction: -1 | 1 }
  | { type: "next" }
  | { type: "escape" };

export interface KeyInput {
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

const VOLUME_STEP = 0.05;

/**
 * YouTube's player shortcuts. Ctrl/Alt/Meta chords are ignored so OS and menu
 * accelerators (Ctrl+O) stay available to the shell.
 */
export function mapShortcut(input: KeyInput): ShortcutAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;

  const key = input.key;
  const lower = key.toLowerCase();

  if (key === "Escape") return finish(input, { type: "escape" });

  if (key === "<" || (input.code === "Comma" && input.shiftKey)) {
    return finish(input, { type: "cycle-rate", direction: -1 });
  }
  if (key === ">" || (input.code === "Period" && input.shiftKey)) {
    return finish(input, { type: "cycle-rate", direction: 1 });
  }
  if (input.shiftKey && lower === "n") return finish(input, { type: "next" });
  if (input.shiftKey) return null;

  if (key === " " || lower === "k") return finish(input, { type: "toggle-play" });
  if (lower === "j") return finish(input, { type: "seek", delta: -10 });
  if (lower === "l") return finish(input, { type: "seek", delta: 10 });
  if (key === "ArrowLeft") return finish(input, { type: "seek", delta: -5 });
  if (key === "ArrowRight") return finish(input, { type: "seek", delta: 5 });
  if (key === "ArrowUp") return finish(input, { type: "volume", delta: VOLUME_STEP });
  if (key === "ArrowDown") return finish(input, { type: "volume", delta: -VOLUME_STEP });
  if (lower === "m") return finish(input, { type: "toggle-mute" });
  if (lower === "f") return finish(input, { type: "toggle-fullscreen" });
  if (lower === "c") return finish(input, { type: "toggle-captions" });
  if (lower === "t") return finish(input, { type: "toggle-theater" });
  if (key === "Home") return finish(input, { type: "seek-start" });
  if (key === "End") return finish(input, { type: "seek-end" });

  if (/^[0-9]$/.test(key)) {
    return finish(input, { type: "seek-ratio", ratio: Number(key) / 10 });
  }

  return null;
}

function finish(input: KeyInput, action: ShortcutAction): ShortcutAction | null {
  if (input.repeat && !allowsRepeat(action)) return null;
  return action;
}

function allowsRepeat(action: ShortcutAction): boolean {
  return (
    action.type === "seek" ||
    action.type === "volume" ||
    action.type === "seek-start" ||
    action.type === "seek-end"
  );
}

/** Volume sliders are not text fields, so player shortcuts keep working after a drag. */
export function isTextEntry(tagName: string, inputType: string | null, editable: boolean): boolean {
  if (editable) return true;
  const tag = tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (inputType ?? "text").toLowerCase();
  return type !== "range" && type !== "button" && type !== "checkbox" && type !== "radio";
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  const inputType = target instanceof HTMLInputElement ? target.type : null;
  return isTextEntry(target.tagName, inputType, target.isContentEditable);
}
