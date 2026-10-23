import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import type { OpenedMedia, PlaylistItem, SubtitleFile } from "../model/media";
import { VIDEO_EXTENSIONS } from "../player/playlist";

interface OpenedDto {
  id: string;
  filename: string;
  path: string;
  extension: string;
  url: string;
  playlist: PlaylistDto[];
  subtitles: SubtitleDto[];
  chaptersText: string | null;
  chaptersFormat: "json" | "vtt" | null;
}

interface PlaylistDto {
  id: string;
  filename: string;
  path: string;
  url: string;
}

interface SubtitleDto {
  id: string;
  filename: string;
  format: string;
  content: string;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickVideoPath(): Promise<string | null> {
  const selected = await open({
    title: "Open video",
    multiple: false,
    directory: false,
    filters: [{ name: "Video", extensions: [...VIDEO_EXTENSIONS] }],
  });
  return asPath(selected);
}

export async function pickSubtitlePath(): Promise<string | null> {
  const selected = await open({
    title: "Open subtitle",
    multiple: false,
    directory: false,
    filters: [{ name: "Subtitles", extensions: ["srt", "vtt"] }],
  });
  return asPath(selected);
}

export async function openPath(path: string): Promise<OpenedMedia> {
  const dto = await invoke<OpenedDto>("open_video", { path });
  return fromDto(dto);
}

export async function readSubtitle(path: string): Promise<SubtitleFile> {
  const dto = await invoke<SubtitleDto>("read_subtitle", { path });
  const format = dto.format === "vtt" ? "vtt" : "srt";
  return { id: dto.id, label: dto.filename, format, content: dto.content };
}

export async function takeLaunchFiles(): Promise<string[]> {
  return invoke<string[]>("take_launch_files");
}

export async function onExternalOpen(handler: (paths: string[]) => void): Promise<() => void> {
  const unlisten = await listen<string[]>("glint-open", (event) => {
    if (event.payload.length > 0) handler(event.payload);
  });
  return unlisten;
}

export async function onFileDrop(handlers: {
  hover: (active: boolean) => void;
  drop: (paths: string[]) => void;
}): Promise<() => void> {
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "over" || payload.type === "enter") handlers.hover(true);
    else if (payload.type === "leave") handlers.hover(false);
    else if (payload.type === "drop") {
      handlers.hover(false);
      handlers.drop(payload.paths);
    }
  });
  return unlisten;
}

export async function setWindowTitle(title: string): Promise<void> {
  await getCurrentWindow().setTitle(title);
}

export async function setFullscreen(on: boolean): Promise<void> {
  await getCurrentWindow().setFullscreen(on);
}

export async function isFullscreen(): Promise<boolean> {
  return getCurrentWindow().isFullscreen();
}

export async function setTheater(on: boolean): Promise<void> {
  const window = getCurrentWindow();
  if (on) await window.maximize();
  else await window.unmaximize();
}

export async function isTheater(): Promise<boolean> {
  return getCurrentWindow().isMaximized();
}

export async function quit(): Promise<void> {
  await getCurrentWindow().close();
}

export function watchChrome(
  handler: (chrome: { fullscreen: boolean; theater: boolean }) => void,
): Promise<() => void> {
  return getCurrentWindow().onResized(async () => {
    const window = getCurrentWindow();
    const [fullscreen, theater] = await Promise.all([window.isFullscreen(), window.isMaximized()]);
    handler({ fullscreen, theater: theater && !fullscreen });
  });
}

function fromDto(dto: OpenedDto): OpenedMedia {
  const playlist: PlaylistItem[] = dto.playlist.map((item) => ({
    id: item.id,
    path: item.path,
    url: item.url,
    filename: item.filename,
  }));
  return {
    source: {
      id: dto.id,
      path: dto.path,
      url: dto.url,
      filename: dto.filename,
      extension: dto.extension,
    },
    playlist,
    subtitles: dto.subtitles.map((file) => ({
      id: file.id,
      label: file.filename,
      format: file.format === "vtt" ? "vtt" : "srt",
      content: file.content,
    })),
    chaptersText: dto.chaptersText,
    chaptersFormat: dto.chaptersFormat,
  };
}

function asPath(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}
