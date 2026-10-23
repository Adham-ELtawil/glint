import type { PlaybackBackend } from "./backend";
import { Html5Backend } from "./html5-backend";

/**
 * The only place a playback engine is constructed.
 *
 * v1 always uses the webview HTML5 engine. To add libmpv later:
 * 1. Implement `PlaybackBackend` (Rust process or embedded libmpv, native surface).
 * 2. Return it here for extensions the webview cannot decode (mkv, avi, …),
 *    or behind a user setting.
 * 3. Leave the controller, shortcuts, and controls alone — they only see this interface.
 * `MediaSource.path` is the filesystem path libmpv should open. `MediaSource.url`
 * is only for engines that play inside the webview.
 */
export function createBackend(): PlaybackBackend {
  return new Html5Backend();
}
