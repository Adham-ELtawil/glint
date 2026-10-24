# Glint

Glint is a desktop video player with the controls, shortcuts, and pacing of the YouTube player. Open a local file and watch it. The window stays out of the way.

v1 plays what the system webview can decode (MP4 and WebM on Windows WebView2). The playback engine sits behind an interface so a [libmpv](https://mpv.io/) backend can be added later for MKV and other codecs without rewriting the controls.

## Features

- Open a file from **File → Open**, by dropping it on the window, or by launching Glint with a path (`glint video.mp4`, or **Open with** from Explorer). A second launch forwards the file to the window that is already open.
- Folder playlist: other videos beside the file you opened, in natural order. **Next** (and Shift+N) plays the following one.
- YouTube-style overlay: red progress bar with buffer, hover time, chapter ticks, scrubbing, play/pause, volume with a mute button and a slider that opens on hover, current/total time, chapter label, captions, settings, theater, and fullscreen. Controls fade after a few seconds. Play, pause, and seek flash in the center.
- Keyboard shortcuts match YouTube. See the table below.
- Subtitles: a same-named `.srt` or `.vtt` next to the video is picked up automatically (including `movie.en.srt`). You can also load one yourself. SRT is converted to WebVTT.
- Chapters, when a sidecar exists: `movie.chapters.json` or `movie.chapters.vtt`. The current chapter is labeled on the control bar and in the hover tooltip.
- Volume, mute, playback speed, and resume position are remembered per file. A new file inherits the last volume and speed. Resume is skipped in the first 5 seconds and the last 10.
- Dark theme. The window title is the file name.

## Requirements

- Node.js 22 or newer
- Rust stable (1.90+; the repo pins stable in `rust-toolchain.toml`)
- Windows: the WebView2 runtime. The MSI and NSIS installers download the bootstrapper if it is missing.
- Linux, for development and CI: GTK 3 and WebKitGTK 4.1

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf build-essential libssl-dev libxdo-dev
```

## Run

```bash
npm install
npm run tauri dev
```

That starts the Vite dev server on [http://127.0.0.1:43123](http://127.0.0.1:43123) and opens the Glint window.

The player UI also runs in a browser, which is useful for layout work. File dialogs and sibling subtitle discovery need the desktop shell; the browser build uses the file picker and drag-and-drop instead.

```bash
npm run dev
```

Open [http://127.0.0.1:43123/?sample=1](http://127.0.0.1:43123/?sample=1) to play the bundled sample, with captions and chapters.

## Build

### Windows installers (MSI and NSIS)

On Windows:

```bash
npm install
npm run tauri build
```

`src-tauri/tauri.windows.conf.json` selects the Windows bundle targets. The installers are written to:

- `src-tauri/target/release/bundle/msi/Glint_0.1.2_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Glint_0.1.2_x64-setup.exe`

NSIS installs for the current user. WiX language is `en-US`. Both register file associations for mp4, m4v, webm, mkv, mov, avi, ogv, ogg, mpeg, and mpg, so **Open with → Glint** passes the path on the command line. The NSIS installer downloads the WebView2 bootstrapper if the runtime is missing.

The Windows webview is started with `--autoplay-policy=no-user-gesture-required` so a file opened from Explorer starts playing.

### Linux and CI

Installers are not cross-compiled. On Linux, build the binary without bundling:

```bash
npm run tauri build -- --no-bundle
```

The executable is `src-tauri/target/release/glint`. With the Linux bundler tools installed, `npm run tauri build` also produces deb, rpm, and AppImage packages because the base config uses `"targets": "all"`.

GitHub Actions (`.github/workflows/ci.yml`) lints, tests, and builds that binary on Ubuntu, and builds the MSI and NSIS packages on Windows.

## Tests

```bash
npm test
npm run lint
npm run format:check
npm run test:rust
```

TypeScript tests cover time formatting, SRT to VTT, shortcut mapping, the resume store, chapters, playlist ordering, error copy, and the player controller against a fake backend. Rust tests cover argument parsing, folder playlist and sidecar discovery, and HTTP range responses from the media server.

## Keyboard shortcuts

| Key          | Action                                         |
| ------------ | ---------------------------------------------- |
| Space, K     | Play / pause                                   |
| J / L        | Seek −10s / +10s                               |
| ← / →        | Seek −5s / +5s                                 |
| ↑ / ↓        | Volume up / down                               |
| M            | Mute                                           |
| F            | Fullscreen                                     |
| Double-click | Fullscreen                                     |
| T            | Theater (maximized window; hides the menu bar) |
| C            | Captions                                       |
| 0–9          | Jump to 0%–90%                                 |
| `<` / `>`    | Slower / faster (0.25×–2×)                     |
| Home / End   | Start / end                                    |
| Shift+N      | Next file in the folder playlist               |
| Ctrl+O       | Open                                           |
| Esc          | Close a menu, or leave fullscreen              |

## Architecture

```
File menu, drag-drop, CLI args
            │
            ▼
     Platform bridge  ──►  Rust: dialog paths, folder scan, sidecar read
            │                    loopback media server (range requests)
            ▼
     PlayerController  ──►  resume store, shortcuts, chapters, SRT→VTT
            │
            ▼
     PlaybackBackend
        ├─ Html5Backend     v1, <video> in the webview
        └─ LibmpvBackend    not implemented; same interface
            │
            ▼
     PlayerView          YouTube-style controls, no playback policy
```

### Playback interface

`src/player/backend.ts` is the seam. The controller calls `load`, `play`, `pause`, `seek`, `setVolume`, `setMuted`, `setRate`, and `setSubtitles`. It never touches a `<video>` element. `src/player/create-backend.ts` is the only place an engine is constructed. v1 returns `Html5Backend`.

`MediaSource` carries both a `url` (what HTML5 plays) and a `path` (what libmpv would open). Adding libmpv later means:

1. Implement `PlaybackBackend` in a new class. The Rust side would own an libmpv instance and render into a native child window or a shared texture. The webview would keep drawing the controls on top, or the backend would report the same snapshots the HTML5 engine reports today.
2. Return that backend from `createBackend()` for extensions WebView2 cannot decode, or behind a setting.
3. Leave the controller, shortcuts, resume store, and view alone.

### Why videos are served from 127.0.0.1

The HTML5 engine still decodes the file. The bytes are not transcoded. A small Rust server (`src-tauri/src/media_server.rs`) binds to `127.0.0.1` on a random port and answers `Range` requests so seeking works on large files. WebView2 and WebKitGTK both do this reliably. Tauri's `asset://` protocol does not, especially on Linux, where GStreamer has no handler for that scheme.

Each opened file gets an unguessable token. The server only maps tokens the user actually opened, and it dies with the process. The page CSP allows media from that loopback host.

### Resume store

`localStorage` key `glint.player.v1`. Each file id (the canonical path in the desktop app) stores position, volume, mute, and speed. The last volume, mute, and speed are also the defaults for a file that has never been opened. At most 200 files are kept. Captions on/off is global. A store left behind under `lumen.player.v1` is copied into the Glint key on startup, and the old key is removed.

### Subtitles and chapters

On open, Rust looks next to the video for:

- `name.srt`, `name.vtt`, `name.en.srt`, and the same pattern for other suffixes
- `name.chapters.json` — `[{ "start": 0, "title": "Intro" }]` or `{ "start": "1:30", "title": "Next" }`
- `name.chapters.vtt` — a WebVTT file whose cue text is the chapter title

SRT is converted in `src/player/subtitles.ts` and attached as a blob WebVTT track. The captions button toggles it. Settings can switch tracks or load another file.

### Project layout

```
src/player/        backend interface, HTML5 engine, controller, pure logic
src/ui/            DOM and CSS for the YouTube-style chrome
src/platform/      Tauri commands and the browser fallback
src-tauri/         commands, folder/sidecar scan, loopback media server
tests/             Vitest unit tests
```

## Roadmap

- **libmpv backend** for MKV, AVI, and other codecs the webview cannot decode. The interface and the `path` field are already in place. v1 shows a clear error instead of a blank video.
- **Playlists** beyond the current folder: a visible queue, previous, and shuffle. Today the playlist is the other video files in the same folder, or the set of files dropped together in the browser preview.
- **Thumbnail preview** on the progress bar. The hover card already shows the time and chapter title; a sprite sheet or a frame grab is the missing piece.

Not in v1: a playlist editor, audio-only files, picture-in-picture, and remembering the window size.

## License

[MIT](LICENSE) © 2026 Adham Yasser
