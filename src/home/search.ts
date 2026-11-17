/**
 * Home-screen search. The query is split into words; a video matches when its
 * title contains any of them (case-insensitive). Results with more matching
 * words come first; between equals, the one matching an earlier-typed word
 * wins; anything still tied keeps its place on the shelf.
 */

/** Lower-cased, de-duplicated words of the query, in the order typed. */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  for (const word of fold(query).split(/\s+/)) {
    if (word && !terms.includes(word)) terms.push(word);
  }
  return terms;
}

export interface TermMatch {
  /** How many of the terms the text contains. */
  count: number;
  /** Index of the earliest-typed term it contains. */
  first: number;
}

/** How well `text` matches the terms, or null when it contains none of them. */
export function matchTerms(text: string, terms: readonly string[]): TermMatch | null {
  const haystack = fold(text);
  let count = 0;
  let first = -1;
  terms.forEach((term, index) => {
    if (!haystack.includes(term)) return;
    count += 1;
    if (first < 0) first = index;
  });
  return count > 0 ? { count, first } : null;
}

/**
 * The items whose text matches the query, best first. An empty query returns
 * every item in its original order.
 */
export function searchItems<T>(items: readonly T[], query: string, text: (item: T) => string): T[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [...items];
  const hits: { item: T; match: TermMatch; index: number }[] = [];
  items.forEach((item, index) => {
    const match = matchTerms(text(item), terms);
    if (match) hits.push({ item, match, index });
  });
  hits.sort(
    (a, b) => b.match.count - a.match.count || a.match.first - b.match.first || a.index - b.index,
  );
  return hits.map((hit) => hit.item);
}

/** Case- and width-insensitive form, so "ＡＢＣ" and "abc" compare equal. */
function fold(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase();
}
