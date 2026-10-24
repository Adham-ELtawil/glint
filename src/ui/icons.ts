/**
 * Player glyphs, drawn on a 24px grid to match the proportions of the YouTube
 * player (24px glyphs in 48px buttons, 2px strokes). The settings gear, skip,
 * replay and check glyphs come from Google's Material Symbols Rounded
 * (Apache-2.0); the rest are drawn here.
 */
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
  | "theater-exit"
  | "fullscreen"
  | "fullscreen-exit"
  | "replay"
  | "seek-back"
  | "seek-forward"
  | "check"
  | "chevron"
  | "back";

interface Glyph {
  /** viewBox; defaults to the 24px grid. Material Symbols use a 960 grid. */
  box?: string;
  body: string;
}

const LINE = `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
/** Filled shape with softened corners, like YouTube's play/next glyphs. */
const SOFT = `stroke="currentColor" stroke-width="2" stroke-linejoin="round"`;

const SPEAKER = `<path d="M12.4 3.4v17.2c0 .8-.9 1.2-1.5.7L6.4 17H3.4a2.2 2.2 0 0 1-2.2-2.2V9.2C1.2 8 2.2 7 3.4 7h3l4.5-4.3c.6-.5 1.5-.1 1.5.7z"/>`;

const GLYPHS: Record<IconName, Glyph> = {
  play: { body: `<path ${SOFT} d="M5.4 4.2 19.6 12 5.4 19.8z"/>` },
  pause: {
    body: `<rect x="5.6" y="4" width="4.6" height="16" rx="1.2"/><rect x="14.4" y="4" width="4.6" height="16" rx="1.2"/>`,
  },
  next: {
    body: `<path ${SOFT} d="M5.2 5.6 14.6 12l-9.4 6.4z"/><rect x="16.8" y="4.6" width="2.6" height="14.8" rx="1.3"/>`,
  },
  volume: {
    body: `${SPEAKER}<path ${LINE} d="M15.6 7.6a5.6 5.6 0 0 1 0 8.8M18.2 5a8 8 0 0 1 0 14"/>`,
  },
  "volume-low": { body: `${SPEAKER}<path ${LINE} d="M15.6 7.6a5.6 5.6 0 0 1 0 8.8"/>` },
  "volume-muted": { body: `${SPEAKER}<path ${LINE} d="m15.6 8.8 6.4 6.4m0-6.4-6.4 6.4"/>` },
  captions: {
    body:
      `<rect ${LINE} x="2" y="4.2" width="20" height="15.6" rx="2.4"/>` +
      `<path ${LINE} stroke-width="1.9" d="M10 10.4a2.5 2.5 0 0 0-4.1 1.4v.4a2.5 2.5 0 0 0 4.1 1.4M17.8 10.4a2.5 2.5 0 0 0-4.1 1.4v.4a2.5 2.5 0 0 0 4.1 1.4"/>`,
  },
  settings: {
    // Material Symbols Rounded "settings", weight 600, scaled to a 22.4px gear.
    box: "36 -924 888 888",
    body: `<path d="M413.09-65.87q-16.26 0-28.68-9.85Q372-85.56 370-101.83l-15-94.56q-15.61-5.31-34.07-15.89-18.45-10.59-31.63-21.33l-85.43 40q-15.7 6.57-31.96 1.78-16.26-4.78-24.82-20.04l-65.92-118.7q-9.13-14.13-5.34-30.1 3.78-15.98 17.47-26.11l79.44-59q-1.44-7.31-1.94-17.11-.5-9.81-.5-17.11 0-7.3.5-17.11.5-9.8 1.94-17.11L93.3-572.65q-14.26-10.13-17.76-26.11-3.5-15.98 5.63-30.67l65.92-118.7q8.56-14.13 24.54-19.48 15.98-5.35 31.67 1.22l87.13 40q12.61-10.18 30.79-20.48 18.17-10.3 33.78-15.17l15-95.57q2-16.83 14.41-26.96 12.42-10.13 28.68-10.13h133.82q16.26 0 28.68 10.13Q588-874.44 590-857.61l15 94.57q15.61 5.87 34.28 15.67 18.68 9.8 31.42 20.98l85.43-40q15.7-6.57 31.46-1.22 15.76 5.35 24.32 19.48l67.48 118.7q8.57 14.69 5.07 31.17-3.5 16.48-17.76 25.61l-80 56.43q1.43 8.31 2.21 18.11.79 9.81.79 18.11 0 8.3-.79 17.61-.78 9.3-2.21 17.61l80 57.43q14.26 9.13 17.76 25.61 3.5 16.48-5.07 31.17l-66.48 118.7q-8.56 14.7-24.54 19.76-15.98 5.07-31.67-1.5l-86.57-40q-13.17 10.74-30.85 21.55-17.67 10.8-34.28 15.67l-15 94.56q-2 16.27-14.41 26.11-12.42 9.85-28.68 9.85H413.09Zm27.43-79.22h78.39l14.57-111.43q33.56-8 63.91-25 30.35-17 54.35-42.7l106 46 34.91-64.65-92.87-67.87q4-17.56 6.78-34.63 2.79-17.06 2.79-34.63 0-17.57-2.29-34.63-2.28-17.07-7.28-34.63l93.44-67.87-35.48-64.65-105.44 46q-23-27.13-53.13-45.48-30.13-18.35-65.69-22.78l-14-110.87h-78.96l-13.43 110.87q-35.13 6.43-65.76 24.28-30.63 17.85-54.2 43.98l-104.87-46-35.48 64.65 92.31 67.3q-4 17.57-6.79 34.92-2.78 17.34-2.78 34.91 0 17.57 2.78 35.2 2.79 17.63 6.79 34.63l-92.31 67.3 35.48 64.65 104.87-46q24.57 25.13 55.2 42.7 30.63 17.56 64.76 25.56l13.43 110.87ZM478.87-350q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38ZM480-480Z"/>`,
  },
  theater: {
    body:
      `<rect ${LINE} x="2" y="4.2" width="20" height="15.6" rx="2.4"/>` +
      `<path ${LINE} d="M2.4 16.4h19.2M9.6 8 7.2 10.4l2.4 2.4M14.4 8l2.4 2.4-2.4 2.4"/>`,
  },
  "theater-exit": {
    body:
      `<rect ${LINE} x="2" y="4.2" width="20" height="15.6" rx="2.4"/>` +
      `<path ${LINE} d="M2.4 16.4h19.2M7.4 8l2.4 2.4-2.4 2.4M16.6 8l-2.4 2.4 2.4 2.4"/>`,
  },
  fullscreen: {
    body: `<path ${LINE} d="M4.6 10.2V4.6h5.6M4.6 4.6l5.8 5.8M19.4 13.8v5.6h-5.6m5.6 0-5.8-5.8"/>`,
  },
  "fullscreen-exit": {
    body: `<path ${LINE} d="M10.4 4.8v5.6H4.8m5.6 0L4.6 4.6M13.6 19.2v-5.6h5.6m-5.6 0 5.8 5.8"/>`,
  },
  replay: {
    box: "0 -960 960 960",
    body: `<path d="M339.5-108Q274-136 225-185t-77-114.5Q120-365 120-440q0-13 8.5-21.5T150-470q13 0 21.5 8.5T180-440q0 125 87.5 212.5T480-140q125 0 212.5-87.5T780-440q0-125-85-212.5T485-740h-22l52 52q9 9 9 21t-9 21q-9 9-21 9t-21-9L368-751q-9-9-9-21t9-21l106-106q8-8 20.5-8t20.5 8q8 8 8 20.5t-8 20.5l-58 58h23q75 0 140.5 28T735-695q49 49 77 114.5T840-440q0 75-28 140.5T735-185q-49 49-114.5 77T480-80q-75 0-140.5-28Z"/>`,
  },
  "seek-back": {
    body: `<path ${SOFT} d="M11 6.6 4.4 12l6.6 5.4zM19.6 6.6 13 12l6.6 5.4z"/>`,
  },
  "seek-forward": {
    body: `<path ${SOFT} d="M13 6.6 19.6 12 13 17.4zM4.4 6.6 11 12l-6.6 5.4z"/>`,
  },
  check: {
    box: "0 -960 960 960",
    body: `<path d="m378-332 363-363q9-9 21.5-9t21.5 9q9 9 9 21.5t-9 21.5L399-267q-9 9-21 9t-21-9L175-449q-9-9-8.5-21.5T176-492q9-9 21.5-9t21.5 9l159 160Z"/>`,
  },
  chevron: { body: `<path ${LINE} d="m9.4 6.4 5.6 5.6-5.6 5.6"/>` },
  back: { body: `<path ${LINE} d="M14.6 6.4 9 12l5.6 5.6"/>` },
};

/** Play and pause share point counts so CSS can morph one into the other. */
export const PLAY_MORPH = {
  playLeft: "M5.4 4.2L12.5 8.1L12.5 15.9L5.4 19.8Z",
  playRight: "M12.5 8.1L19.6 12L19.6 12L12.5 15.9Z",
  pauseLeft: "M6.6 5L9.2 5L9.2 19L6.6 19Z",
  pauseRight: "M14.8 5L17.4 5L17.4 19L14.8 19Z",
} as const;

/**
 * The bar's play/pause glyph. Its `d` comes from CSS (`.morph-left` /
 * `.morph-right`) so the shape animates like YouTube's; the attributes are
 * the play shape for engines without CSS `d` support.
 */
export function playPauseIcon(): string {
  return (
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path class="morph-left" ${SOFT} d="${PLAY_MORPH.playLeft}"/>` +
    `<path class="morph-right" ${SOFT} d="${PLAY_MORPH.playRight}"/></svg>`
  );
}

export function icon(name: IconName): string {
  const glyph = GLYPHS[name];
  return `<svg viewBox="${glyph.box ?? "0 0 24 24"}" aria-hidden="true" focusable="false">${glyph.body}</svg>`;
}

/**
 * Glint's app mark: a four-point glint with a play triangle in its heart.
 * Same artwork as `src-tauri/icons/source/glint-small.svg`, the variant tuned
 * for small sizes (the header shows it at about 22px).
 */
export function brandMark(): string {
  return (
    `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false">` +
    `<defs><linearGradient id="glint-brand-g" x1="40" y1="24" x2="216" y2="232" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#ff4d6d"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>` +
    `<path fill="url(#glint-brand-g)" d="M128 2C172 56 200 84 254 128C200 172 172 200 128 254C84 200 56 172 2 128C56 84 84 56 128 2Z"/>` +
    `<path fill="#fff" d="M105.13 95.32A10 10 0 0 1 120.13 86.66L176.74 119.34A10 10 0 0 1 176.74 136.66L120.13 169.34A10 10 0 0 1 105.13 160.68Z"/>` +
    `</svg>`
  );
}
