/**
 * Release notes for the update card. The notes are the CHANGELOG section of
 * the release (copied into `latest.json` by the release workflow), which is
 * Markdown. Only the little Markdown the changelog uses is understood:
 * `### Headings`, `-` bullets (nested by indentation), `**bold**`, `` `code` ``
 * and `[links](url)`, which keep only their text. Everything else is plain
 * text. The result is data, so the card builds DOM nodes and never parses
 * HTML from the network.
 */

export interface InlineRun {
  text: string;
  bold?: boolean;
  code?: boolean;
}

export type NoteBlock =
  | { kind: "heading"; text: string }
  | { kind: "item"; depth: number; runs: InlineRun[] }
  | { kind: "text"; runs: InlineRun[] };

/** Splits one line of Markdown into bold, code and plain runs. */
export function parseInline(line: string): InlineRun[] {
  const text = line.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  const runs: InlineRun[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: text.slice(last, at) });
    if (match[1] != null) runs.push({ text: match[1], bold: true });
    else runs.push({ text: match[2], code: true });
    last = at + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.filter((run) => run.text.length > 0);
}

export function parseNotes(markdown: string | null | undefined): NoteBlock[] {
  if (!markdown) return [];
  const blocks: NoteBlock[] = [];
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) continue;
    const heading = raw.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      const text = heading[1].replace(/\*\*/g, "").trim();
      if (text) blocks.push({ kind: "heading", text });
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(raw)) continue;
    const item = raw.match(/^(\s*)[-*+]\s+(.*)$/);
    if (item) {
      const depth = Math.min(2, Math.floor(item[1].replace(/\t/g, "  ").length / 2));
      blocks.push({ kind: "item", depth, runs: parseInline(item[2].trim()) });
      continue;
    }
    // A wrapped bullet continues the previous item.
    const previous = blocks[blocks.length - 1];
    if (/^\s{2,}\S/.test(raw) && previous && previous.kind !== "heading") {
      previous.runs.push(...parseInline(` ${raw.trim()}`));
      continue;
    }
    blocks.push({ kind: "text", runs: parseInline(raw.trim()) });
  }
  return blocks;
}

/**
 * The body of `## [version]` in a Keep a Changelog file, without its heading,
 * up to the next release heading or the link references at the end.
 */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.replace(/\r\n?/g, "\n").split("\n");
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = lines.findIndex((line) => new RegExp(`^## \\[?${escaped}\\]?(\\s|$)`).test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]) || /^\[[^\]]+\]:\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  return body || null;
}
