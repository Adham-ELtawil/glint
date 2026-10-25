import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { createHistoryStore, type HistoryEntry } from "./home/history-store";
import { offlineLibrary, type FolderScan, type LibraryFolder } from "./home/library";
import { buildHomeModel, pathKey, samePath } from "./home/model";
import { ThumbnailService } from "./home/thumbnails";
import { sourceFromItem } from "./model/media";
import type { OpenedMedia, PlaylistItem } from "./model/media";
import * as browser from "./platform/browser";
import * as desktop from "./platform/tauri";
import { createBackend } from "./player/create-backend";
import { PlayerController } from "./player/controller";
import { isVideoFilename } from "./player/playlist";
import { createResumeStore } from "./player/resume-store";
import type { ShortcutAction } from "./player/shortcuts";
import { srtToVtt, subtitleFormat } from "./player/subtitles";
import { HomeView, type HomeActions } from "./ui/home";
import { PlayerView, type ViewActions } from "./ui/view";

/** A rescan on returning home is skipped if the last one is this recent. */
const RESCAN_AFTER_MS = 15_000;

export async function start(root: HTMLElement): Promise<void> {
  const native = desktop.isTauri();
  const backend = createBackend();
  const store = createResumeStore(localStorage);
  const history = createHistoryStore(localStorage);
  const library = native ? desktop.desktopLibrary : offlineLibrary;
  const thumbs = new ThumbnailService(library);
  let folders: LibraryFolder[] = [];
  let scans: FolderScan[] = [];
  let scanning = library.available;
  let lastScan = 0;
  let scanRun = 0;
  const availability = new Map<string, boolean>();
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
    goHome: () => showHome(),
    addFolder: () => void addFolder(),
    clearHistory: () => {
      showHome();
      home.confirmClearHistory();
    },
  };

  const homeActions: HomeActions = {
    play: (path, options) => void playFromHome(path, options.fromStart),
    openFile: () => void openVideo(),
    addFolder: () => void addFolder(),
    removeFolder: (path) => void removeFolder(path),
    removeHistory: (id) => removeHistory(id),
    clearHistory: () => {
      history.clear();
      store.forgetAll();
      home.toast("Watch history cleared");
    },
  };

  const view = new PlayerView(root, actions, native);
  backend.attach(view.videoSlot);
  player = new PlayerController(backend, store, {
    onState: (state) => view.render(state),
    onFlash: (effect) => view.flash(effect),
    onTitle: (filename) => void setTitle(filename),
    onFullscreen: (on) => void applyFullscreen(on),
    onTheater: (on) => void applyTheater(on),
    onProgress: (id, position, duration) => history.progress(id, position, duration),
  });

  const home = new HomeView(homeActions, thumbs);
  view.stage.append(home.root);
  history.subscribe(() => renderHome());
  window.addEventListener("focus", () => {
    if (home.visible && Date.now() - lastScan > RESCAN_AFTER_MS) void rescan();
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
    else showHome();
  } else {
    const sample = await browser.loadSample();
    if (sample) await playMedia(sample);
    else showHome();
  }

  function renderHome(): void {
    if (!home.visible) return;
    home.render(
      buildHomeModel({
        native: library.available,
        history: history.list(),
        availability,
        folders,
        scans,
        scanning,
      }),
    );
  }

  function showHome(): void {
    if (home.visible) return;
    const state = player.getState();
    if (state.fullscreen) player.setFullscreen(false);
    if (player.currentId()) player.suspend();
    view.setHomeActive(true);
    home.show();
    void setTitle(null);
    renderHome();
    void refreshAvailability();
    if (library.available && Date.now() - lastScan > RESCAN_AFTER_MS) void rescan();
  }

  function showPlayer(): void {
    if (!home.visible) return;
    home.hide();
    view.setHomeActive(false);
    void setTitle(player.getState().filename);
  }

  /** Which history files are still on disk. Missing ones show as unavailable. */
  async function refreshAvailability(): Promise<void> {
    if (!library.available) return;
    const paths = history.list().map((entry) => entry.path);
    if (paths.length === 0) return;
    try {
      const infos = await library.mediaInfo(paths);
      let changed = false;
      for (const info of infos) {
        const key = pathKey(info.path);
        if (availability.get(key) !== info.exists) changed = true;
        availability.set(key, info.exists);
      }
      if (changed) renderHome();
    } catch {
      // Keep showing every card as available.
    }
  }

  async function rescan(): Promise<void> {
    if (!library.available) return;
    const run = ++scanRun;
    try {
      const nextFolders = await library.folders();
      const nextScans = await library.scan();
      if (run !== scanRun) return;
      folders = nextFolders;
      scans = nextScans;
    } catch {
      // A failed scan leaves the last result on screen.
    } finally {
      if (run === scanRun) {
        scanning = false;
        lastScan = Date.now();
        renderHome();
      }
    }
  }

  async function addFolder(): Promise<void> {
    if (!library.available) return;
    const path = await library.pickFolder(folders[0]?.path);
    if (!path) return;
    showHome();
    try {
      folders = await library.addFolder(path);
    } catch (error) {
      home.toast(messageOf(error));
      return;
    }
    renderHome();
    await rescan();
    const added = folders.find((folder) => samePath(folder.path, path));
    if (added) home.toast(`Added ${added.name} to Home`);
  }

  async function removeFolder(path: string): Promise<void> {
    const folder = folders.find((item) => samePath(item.path, path));
    try {
      folders = await library.removeFolder(path);
    } catch (error) {
      home.toast(messageOf(error));
      return;
    }
    scans = scans.filter((scan) => !samePath(scan.path, path));
    renderHome();
    home.toast(`Removed ${folder?.name ?? "folder"} from Home`, {
      label: "Undo",
      run: () => {
        void (async () => {
          try {
            folders = await library.addFolder(path);
          } catch (error) {
            home.toast(messageOf(error));
            return;
          }
          await rescan();
        })();
      },
    });
  }

  function removeHistory(id: string): void {
    const entry: HistoryEntry | null = history.get(id);
    if (!entry) return;
    const saved = store.file(id);
    history.remove(id);
    store.forget(id);
    home.toast("Removed from history", {
      label: "Undo",
      run: () => {
        history.restore(entry);
        if (saved) store.updateFile(id, saved);
      },
    });
  }

  async function playFromHome(path: string, fromStart: boolean): Promise<void> {
    const current = player.currentId();
    const state = player.getState();
    if (!fromStart && current && samePath(current, path) && state.phase === "ready") {
      showPlayer();
      player.resumePlayback();
      return;
    }
    await openPaths([path], { fromStart });
  }

  /** Every way of starting a video ends here, so the home screen gets out of the way. */
  async function playMedia(opened: OpenedMedia): Promise<void> {
    showPlayer();
    await player.open(opened);
    const source = opened.source;
    if (source.path && player.currentId() === source.id && player.getState().phase !== "error") {
      history.record({ id: source.id, path: source.path, filename: source.filename });
    }
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
      showPlayer();
      player.showFailure("Choose an MP4, WebM, or another video file.");
      return;
    }
    await playMedia(opened);
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

  async function openPaths(paths: string[], options: { fromStart?: boolean } = {}): Promise<void> {
    const videos = paths.filter((path) => isVideoFilename(path));
    const target = videos[0] ?? paths.find((path) => path.trim().length > 0);
    if (!target) return;
    try {
      const opened = await desktop.openPath(target);
      if (options.fromStart) store.updateFile(opened.source.id, { position: 0 });
      await playMedia(opened);
    } catch (error) {
      showPlayer();
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
        await playMedia(opened);
      } catch (error) {
        player.showFailure(messageOf(error));
      }
      return;
    }
    const sidecars = browser.sidecarsFor(next.id);
    await playMedia({
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
      showPlayer();
      player.showFailure("Drop an MP4, WebM, or another video file.");
      return;
    }
    await playMedia(opened);
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
