import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import { sourceFromItem } from "./model/media";
import type { PlaylistItem } from "./model/media";
import * as browser from "./platform/browser";
import * as desktop from "./platform/tauri";
import { createBackend } from "./player/create-backend";
import { PlayerController } from "./player/controller";
import { isVideoFilename } from "./player/playlist";
import { createResumeStore } from "./player/resume-store";
import type { ShortcutAction } from "./player/shortcuts";
import { srtToVtt, subtitleFormat } from "./player/subtitles";
import { PlayerView, type ViewActions } from "./ui/view";

export async function start(root: HTMLElement): Promise<void> {
  const native = desktop.isTauri();
  const backend = createBackend();
  const store = createResumeStore(localStorage);
  // Closures in `actions` capture this binding before the view exists, so it
  // cannot be a const. It is assigned exactly once, just below.
  // eslint-disable-next-line prefer-const
  let player!: PlayerController;
  let syncingChrome = false;

  const actions: ViewActions = {
    openVideo: () => void openVideo(),
    openSubtitle: () => void openSubtitle(),
    quit: () => void quit(),
    togglePlay: () => player.togglePlay(),
    seekRatio: (ratio) => player.seekRatio(ratio),
    setVolume: (volume) => player.setVolume(volume),
    toggleMute: () => player.toggleMute(),
    toggleCaptions: () => player.toggleCaptions(),
    selectTrack: (id) => player.selectTrack(id),
    setRate: (rate) => player.setRate(rate),
    next: () => void playNext(),
    toggleFullscreen: () => player.toggleFullscreen(),
    toggleTheater: () => player.toggleTheater(),
    replay: () => player.togglePlay(),
    startOver: () => player.startOver(),
    shortcut: (action) => onShortcut(action),
    filesDropped: (files) => void onFiles(files),
  };

  const view = new PlayerView(root, actions, native);
  backend.attach(view.videoSlot);
  player = new PlayerController(backend, store, {
    onState: (state) => view.render(state),
    onFlash: (effect) => view.flash(effect),
    onTitle: (filename) => void setTitle(filename),
    onFullscreen: (on) => void applyFullscreen(on),
    onTheater: (on) => void applyTheater(on),
  });

  document.addEventListener("fullscreenchange", () => {
    if (!native) player.noteFullscreen(document.fullscreenElement != null);
  });
  window.addEventListener("beforeunload", () => player.persist());

  if (native) {
    await desktop.onExternalOpen((paths) => void openPaths(paths));
    await desktop.onFileDrop({
      hover: (active) => view.setDragHover(active),
      drop: (paths) => void openPaths(paths),
    });
    try {
      await desktop.watchChrome((chrome) => {
        if (syncingChrome) return;
        player.noteFullscreen(chrome.fullscreen);
        player.noteTheater(chrome.theater);
      });
    } catch {
      // Window resize events are optional. Fullscreen still toggles on the button.
    }
    const launch = await desktop.takeLaunchFiles();
    if (launch.length > 0) await openPaths(launch);
  } else {
    const sample = await browser.loadSample();
    if (sample) await player.open(sample);
  }

  async function openVideo(): Promise<void> {
    if (native) {
      const path = await desktop.pickVideoPath();
      if (path) await openPaths([path]);
      return;
    }
    const files = await browser.pickFiles(browser.videoAccept(), true);
    if (files.length === 0) return;
    const opened = await browser.openFiles(files);
    if (!opened) {
      player.showFailure("Choose an MP4, WebM, or another video file.");
      return;
    }
    await player.open(opened);
  }

  async function openSubtitle(): Promise<void> {
    if (native) {
      const path = await desktop.pickSubtitlePath();
      if (!path) return;
      try {
        const file = await desktop.readSubtitle(path);
        player.addSubtitle({
          id: file.id,
          label: file.label,
          vtt: file.format === "srt" ? srtToVtt(file.content) : file.content,
        });
      } catch (error) {
        player.showFailure(messageOf(error));
      }
      return;
    }
    const files = await browser.pickFiles(".srt,.vtt,text/vtt", false);
    const file = files[0];
    if (!file) return;
    const format = subtitleFormat(file.name);
    if (!format) {
      player.showFailure("Subtitles need to be an .srt or .vtt file.");
      return;
    }
    player.addSubtitle({
      id: `${file.name}:${file.size}`,
      label: file.name,
      vtt: format === "srt" ? srtToVtt(await file.text()) : await file.text(),
    });
  }

  async function openPaths(paths: string[]): Promise<void> {
    const videos = paths.filter((path) => isVideoFilename(path));
    const target = videos[0] ?? paths.find((path) => path.trim().length > 0);
    if (!target) return;
    try {
      const opened = await desktop.openPath(target);
      await player.open(opened);
    } catch (error) {
      player.showFailure(messageOf(error));
    }
  }

  async function playNext(): Promise<void> {
    const next = player.peekNext();
    if (!next) return;
    if (native && next.path) {
      const playlist = player.playlist();
      try {
        const opened = await desktop.openPath(next.path);
        if (playlist.length > 1 && playlist.some((item) => item.path === next.path)) {
          opened.playlist = mergePlaylist(playlist, opened.playlist);
        }
        await player.open(opened);
      } catch (error) {
        player.showFailure(messageOf(error));
      }
      return;
    }
    const sidecars = browser.sidecarsFor(next.id);
    await player.open({
      source: sourceFromItem(next),
      playlist: player.playlist(),
      subtitles: sidecars?.subtitles ?? [],
      chaptersText: sidecars?.chaptersText ?? null,
      chaptersFormat: sidecars?.chaptersFormat ?? null,
    });
  }

  function onShortcut(action: ShortcutAction): void {
    player.handleShortcut(action);
  }

  async function onFiles(files: File[]): Promise<void> {
    const opened = await browser.openFiles(files);
    if (!opened) {
      player.showFailure("Drop an MP4, WebM, or another video file.");
      return;
    }
    await player.open(opened);
  }

  async function quit(): Promise<void> {
    player.persist();
    if (native) await desktop.quit();
  }

  async function setTitle(filename: string | null): Promise<void> {
    const title = filename ? `${filename} - Glint` : "Glint";
    document.title = title;
    if (!native) return;
    try {
      await desktop.setWindowTitle(title);
    } catch {
      // The document title still updates in the browser preview.
    }
  }

  async function applyFullscreen(on: boolean): Promise<void> {
    syncingChrome = true;
    try {
      if (native) await desktop.setFullscreen(on);
      else if (on) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      player.noteFullscreen(!on);
    } finally {
      syncingChrome = false;
    }
  }

  async function applyTheater(on: boolean): Promise<void> {
    if (!native) return;
    syncingChrome = true;
    try {
      await desktop.setTheater(on);
    } catch {
      player.noteTheater(!on);
    } finally {
      syncingChrome = false;
    }
  }
}

function mergePlaylist(previous: PlaylistItem[], fresh: PlaylistItem[]): PlaylistItem[] {
  const byPath = new Map(fresh.map((item) => [item.path, item]));
  return previous.map((item) => byPath.get(item.path) ?? item);
}

function messageOf(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong opening that file.";
}
