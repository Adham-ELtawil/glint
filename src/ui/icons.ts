export type IconName =
  | "play"
  | "pause"
  | "next"
  | "volume"
  | "volume-low"
  | "volume-muted"
  | "captions"
  | "settings"
  | "theater"
  | "fullscreen"
  | "fullscreen-exit"
  | "replay"
  | "seek-back"
  | "seek-forward"
  | "check"
  | "chevron"
  | "back";

const PATHS: Record<IconName, string> = {
  play: `<path d="M8.2 5.2v13.6c0 .8.9 1.3 1.6.8l9.8-6.8c.6-.4.6-1.3 0-1.7L9.8 4.4c-.7-.5-1.6 0-1.6.8z"/>`,
  pause: `<path d="M7 5h3.2v14H7zm6.8 0H17v14h-3.2z"/>`,
  next: `<path d="M6.2 5.3v13.4c0 .7.8 1.1 1.4.7l8.2-6.7c.5-.4.5-1.1 0-1.5L7.6 4.6c-.6-.4-1.4 0-1.4.7zM17.2 4.8h1.6v14.4h-1.6z"/>`,
  volume: `<path d="M4 9.2h2.8L11 5.6v12.8L6.8 14.8H4zm9.2.2v5.2a3.2 3.2 0 0 0 0-5.2zm0-2.2a5.4 5.4 0 0 1 0 9.6V7.2z"/>`,
  "volume-low": `<path d="M4 9.2h2.8L11 5.6v12.8L6.8 14.8H4zm8.6 1.1a2.2 2.2 0 0 1 0 3.4v-3.4z"/>`,
  "volume-muted": `<path d="M4 9.2h2.8L11 5.6v12.8L6.8 14.8H4zm9.1.2 1.8 1.8 1.8-1.8 1.2 1.2-1.8 1.8 1.8 1.8-1.2 1.2-1.8-1.8-1.8 1.8-1.2-1.2 1.8-1.8-1.8-1.8z"/>`,
  captions: `<path d="M3 6.5h18v11H3v-11zm2 2v7h14v-7H5zm1.6 1.6h3.2v1.5H8.2v2.3h1.6v1.5H6.6v-5.3zm5.2 0h3.2v1.5h-1.6v2.3h1.6v1.5h-3.2v-5.3z"/>`,
  settings: `<path d="M19.4 13.2a7.2 7.2 0 0 0 .05-1.2 7.2 7.2 0 0 0-.05-1.2l1.7-1.3a.4.4 0 0 0 .1-.5l-1.6-2.8a.4.4 0 0 0-.5-.2l-2 .8a6.6 6.6 0 0 0-2.1-1.2l-.3-2.1a.4.4 0 0 0-.4-.4h-3.2a.4.4 0 0 0-.4.4l-.3 2.1a6.6 6.6 0 0 0-2.1 1.2l-2-.8a.4.4 0 0 0-.5.2L2.8 9a.4.4 0 0 0 .1.5l1.7 1.3a7.2 7.2 0 0 0 0 2.4l-1.7 1.3a.4.4 0 0 0-.1.5l1.6 2.8a.4.4 0 0 0 .5.2l2-.8a6.6 6.6 0 0 0 2.1 1.2l.3 2.1a.4.4 0 0 0 .4.4h3.2a.4.4 0 0 0 .4-.4l.3-2.1a6.6 6.6 0 0 0 2.1-1.2l2 .8a.4.4 0 0 0 .5-.2l1.6-2.8a.4.4 0 0 0-.1-.5l-1.7-1.3zM12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4z"/>`,
  theater: `<path d="M3.5 6.5h17a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 16V8a1.5 1.5 0 0 1 1.5-1.5zm1.5 2v7h14v-7H5z"/>`,
  fullscreen: `<path d="M4 9V5h4v1.8H5.8V9H4zm12-2.2V5h4v4h-1.8V6.8H16zM5.8 16.2V14H4v4h4v-1.8H5.8zM18.2 18H20v-4h-1.8v2.2H16V18h2.2z"/>`,
  "fullscreen-exit": `<path d="M9 4v3.2H5.8V9H4V4h5zm9.2 3.2H15V4h5v5h-1.8V7.2zM4 15h1.8v1.8H9V20H4v-5zm12.2 1.8V15H20v5h-5v-1.8h1.2z"/>`,
  replay: `<path d="M12 5a7 7 0 1 1-6.3 4H8l-3.2-3.2L1.5 9H4a8.5 8.5 0 1 0 2.2-4.7L7.4 5.6A7 7 0 0 1 12 5zm-1 3.2h1.6v4.3l3 1.8-.8 1.3-3.8-2.3V8.2z"/>`,
  "seek-back": `<path d="M11.2 7.2 6 12l5.2 4.8V13h5.6v-2H11.2V7.2zM5 6.5h1.6v11H5v-11z"/>`,
  "seek-forward": `<path d="M12.8 7.2V11H7.2v2h5.6v3.8L18 12l-5.2-4.8zM17.4 6.5H19v11h-1.6v-11z"/>`,
  check: `<path d="M9.2 16.2 4.8 11.8l1.3-1.3 3.1 3.1 8-8 1.3 1.3-9.3 9.3z"/>`,
  chevron: `<path d="M9.2 6.2 14.9 12l-5.7 5.8-1.3-1.3L12.3 12 7.9 7.5z"/>`,
  back: `<path d="M14.8 6.2 9.1 12l5.7 5.8 1.3-1.3L11.7 12l4.4-4.5z"/>`,
};

export function icon(name: IconName): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;
}
