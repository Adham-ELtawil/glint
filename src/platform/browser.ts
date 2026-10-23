import type { OpenedMedia, PlaylistItem, SubtitleFile } from "../model/media";
import { sourceFromItem } from "../model/media";
import { isVideoFilename, sortByFilename } from "../player/playlist";
import { subtitleFormat } from "../player/subtitles";

interface HeldFile {
  file: File;
  url: string;
}

const held = new Map<string, HeldFile>();

export interface SidecarBundle {
  subtitles: SubtitleFile[];
  chaptersText: string | null;
  chaptersFormat: "json" | "vtt" | null;
}

const sidecarById = new Map<string, SidecarBundle>();

/** Sidecars from the last browser drop, keyed by playlist item id. */
export function sidecarsFor(id: string): SidecarBundle | null {
  return sidecarById.get(id) ?? null;
}

export async function openFiles(files: File[]): Promise<OpenedMedia | null> {
  const videos = sortByFilename(
    files.filter((file) => isVideoFilename(file.name)).map((file) => hold(file)),
  );
  if (videos.length === 0) return null;
  const parsed = await subtitleFiles(files);
  const only = videos.length === 1;
  sidecarById.clear();
  for (const video of videos) {
    const chapters = await chapterFile(files, video.filename);
    sidecarById.set(video.id, {
      subtitles: matchingSubtitles(parsed, video.filename, only),
      chaptersText: chapters?.text ?? null,
      chaptersFormat: chapters?.format ?? null,
    });
  }
  const first = sidecarById.get(videos[0].id)!;
  return {
    source: sourceFromItem(videos[0]),
    playlist: videos,
    subtitles: first.subtitles,
    chaptersText: first.chaptersText,
    chaptersFormat: first.chaptersFormat,
  };
}

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      resolve(files);
    };
    input.addEventListener("change", () => finish([...(input.files ?? [])]));
    input.addEventListener("cancel", () => finish([]));
    window.addEventListener(
      "focus",
      () => {
        window.setTimeout(() => finish([]), 400);
      },
      { once: true },
    );
    input.click();
  });
}

export async function loadSample(): Promise<OpenedMedia | null> {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("sample")) return null;
  const [videoRes, srtRes, chapterRes] = await Promise.all([
    fetch("/sample/sample.mp4"),
    fetch("/sample/sample.srt"),
    fetch("/sample/sample.chapters.json"),
  ]);
  if (!videoRes.ok) return null;
  const videoBlob = await videoRes.blob();
  const file = new File([videoBlob], "sample.mp4", { type: "video/mp4" });
  const opened = await openFiles([file]);
  if (!opened) return null;
  if (srtRes.ok) {
    const content = await srtRes.text();
    opened.subtitles = [{ id: "sample.srt", label: "sample.srt", format: "srt", content }];
  }
  if (chapterRes.ok) {
    opened.chaptersText = await chapterRes.text();
    opened.chaptersFormat = "json";
  }
  return opened;
}

function hold(file: File): PlaylistItem {
  const id = `${file.name}:${file.size}:${file.lastModified}`;
  const existing = held.get(id);
  if (existing) {
    return { id, path: null, url: existing.url, filename: file.name };
  }
  const url = URL.createObjectURL(file);
  held.set(id, { file, url });
  return { id, path: null, url, filename: file.name };
}

function stemOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

function matchesVideo(sidecarName: string, videoName: string): boolean {
  const stem = stemOf(videoName);
  const sidecarStem = stemOf(sidecarName);
  return sidecarStem === stem || sidecarStem.startsWith(`${stem}.`);
}

function matchingSubtitles(
  subtitles: SubtitleFile[],
  videoName: string,
  onlyVideo: boolean,
): SubtitleFile[] {
  const matched = subtitles.filter((file) => matchesVideo(file.label, videoName));
  if (matched.length > 0) return matched;
  return onlyVideo ? subtitles : [];
}

async function chapterFile(
  files: File[],
  videoName: string,
): Promise<{ text: string; format: "json" | "vtt" } | null> {
  const stem = stemOf(videoName);
  const jsonName = `${stem}.chapters.json`;
  const vttName = `${stem}.chapters.vtt`;
  const json = files.find((file) => file.name.toLowerCase() === jsonName);
  const vtt = files.find((file) => file.name.toLowerCase() === vttName);
  const chosen = json ?? vtt;
  if (!chosen) return null;
  return {
    text: await chosen.text(),
    format: json ? "json" : "vtt",
  };
}

async function subtitleFiles(files: File[]): Promise<SubtitleFile[]> {
  const result: SubtitleFile[] = [];
  for (const file of files) {
    const format = subtitleFormat(file.name);
    if (!format) continue;
    result.push({
      id: `${file.name}:${file.size}:${file.lastModified}`,
      label: file.name,
      format,
      content: await file.text(),
    });
  }
  return result;
}

export function videoAccept(): string {
  return "video/mp4,video/webm,video/*,.mp4,.m4v,.webm,.mkv,.mov,.avi,.ogv,.mpeg,.mpg";
}
