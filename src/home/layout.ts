/** Grid geometry for the home screen, shared by the view and the tests. */

/** Narrowest a card may get before the grid drops a column. */
export const CARD_MIN_WIDTH = 250;
/** Horizontal gap between cards (YouTube's home grid uses 16px). */
export const GRID_GAP = 16;
export const MAX_COLUMNS = 6;
/** Rows a section shows before "Show more". */
export const COLLAPSED_ROWS = 2;

export function columnsFor(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  const fit = Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP));
  return Math.min(MAX_COLUMNS, Math.max(1, fit));
}

/** How many cards a collapsed section shows. */
export function collapsedCount(columns: number, rows = COLLAPSED_ROWS): number {
  return Math.max(1, columns) * Math.max(1, rows);
}

/** Side padding of the home content; tighter on narrow windows. */
export function gutterFor(width: number): number {
  if (width < 720) return 16;
  if (width < 1100) return 24;
  return 32;
}
