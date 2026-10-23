/** A file the HTML5 engine can try to play, plus the path a future libmpv backend would open. */
export interface MediaSource {
  /** Stable identity for resume. Canonical filesystem path in the desktop app. */
  id: string;
  /** Real filesystem path. Null when the browser preview only has a blob URL. */
  path: string | null;
  /** URL assigned to the `<video>` element (loopback media server, blob, or http). */
  url: string;
  filename: string;
  extension: string;
}

export interface PlaylistItem {
  id: string;
  path: string | null;
  url: string;
  filename: string;
}

export interface SubtitleFile {
  id: string;
  label: string;
  format: "srt" | "vtt";
  content: string;
}

export interface OpenedMedia {
  source: MediaSource;
  playlist: PlaylistItem[];
  subtitles: SubtitleFile[];
  chaptersText: string | null;
  chaptersFormat: "json" | "vtt" | null;
}

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function sourceFromItem(item: PlaylistItem): MediaSource {
  return {
    id: item.id,
    path: item.path,
    url: item.url,
    filename: item.filename,
    extension: extensionOf(item.filename),
  };
}
