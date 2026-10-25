# Changelog

All notable changes to Glint are listed here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Glint uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.6] - 2026-10-25

### Added

- **Automatic updates.** A few seconds after Glint starts, it checks GitHub for a newer version. If there is one, a card in the top-right corner says **Glint X.Y.Z is available** with **Update** and **Later**. **Update** shows the download progress, installs the new version, and restarts Glint, and your place in the video is saved first. Updates are signed, and Glint refuses any download whose signature doesn't match its release key.
  - The check is quiet: offline, or if GitHub can't be reached, nothing is shown, and it never pauses or slows playback. An offer that arrives while a video is fullscreen waits until you leave fullscreen.
  - **Help → Check for updates…** checks right away and says **You're up to date** when you are. The Help menu also shows the installed version.
  - Coming from 0.1.5 or older, install 0.1.6 by hand once. Later versions arrive on their own.

### Changed

- Release builds sign the installer for the updater. The release workflow uploads the signature and a `latest.json` manifest with the installer, and needs the signing key in the repository's secrets. Pull request builds skip the signature, so they don't need the key.

## [0.1.5] - 2026-10-25

### Changed

- **Open with** is registered only for `.mp4`, `.m4v`, and `.webm`, the formats Glint plays reliably. Earlier installers also registered MKV, AVI, MOV, OGV, OGG, MPEG, and MPG, which WebView2 can't play (or, for MOV, often can't), so double-clicking them opened Glint to an error. You can still open any file from inside Glint.
- The "can't be played" message, the installer description, and the README say that support for more formats is planned, and the README's format table now covers MOV, HEVC, Dolby (AC-3/E-AC-3), and DTS accurately.
- The README has a short animated demo, release, download, and CI badges, a clearer download section with the SmartScreen **More info → Run anyway** step and how to check the installer's SHA-256, and credits for the open movies in the screenshots.

### Added

- Ready for a public repository: issue forms for bugs and feature requests, a pull request template, `CONTRIBUTING.md`, `SECURITY.md` (private reporting through GitHub security advisories), and `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- `THIRD_PARTY_NOTICES.md`, listing the Roboto font license and the licenses of the npm and Rust packages inside the app.
- CI runs the Rust tests on Windows and keeps the installers as a build artifact. A new release workflow builds the installer from a `v*` tag and drafts a GitHub release with the installer, its SHA-256, and the changelog notes.

### Fixed

- Windows' **Videos** folder keeps its default label on Home when Windows spells its path differently from the one Glint saved, such as a short 8.3 name, a junction, or a folder moved into OneDrive.

## [0.1.4] - 2026-10-25

### Added

- A home screen. Glint now opens to **Continue watching** and a shelf for each video folder instead of an empty player.
  - **Continue watching** shows your most recent videos with a thumbnail, a progress bar, the length, the folder, and when you last watched. Click to resume, or right-click for **Play from the beginning**. Remove a video with the **×** on its card, the Delete key, or the right-click menu, with **Undo**. Videos that were moved or deleted show as unavailable.
  - **Folders.** Windows' **Videos** folder is on Home by default. Add more from **Add a folder** or **File → Add folder to Home…**, and remove them from each shelf's **⋮** menu. Glint scans each folder and one level of subfolders in the background, newest first, and skips hidden and system files.
  - **Thumbnails** are made from the video the first time it appears and cached on disk. Cards shimmer while they load, and formats WebView2 can't decode get a tile with the file type.
  - Go home with the **Home** button, the Glint logo, **View → Home**, Backspace, or the mouse back button. Cards work with the keyboard: arrow keys, Enter, Delete, and Shift+F10.
- **View → Clear watch history…** removes the history and saved positions after asking. Video files, folders, and your volume and speed settings are kept.

### Changed

- The empty screen uses the Glint star instead of a red circle with a play triangle, which looked like YouTube's logo.
- The download badge in the README uses Glint's coral instead of YouTube red.

### Fixed

- The volume slider no longer closes in the middle of a drag when the pointer drifts off its thin track. It is also much easier to grab: the whole height of the control bar responds, not just the 3px line.

## [0.1.3] - 2026-10-24

### Added

- New README for users and developers, with a screenshot, install steps, shortcuts, supported formats, FAQ, and a release checklist.
- This changelog.

### Changed

- New Glint app icon, a coral four-point glint with a play triangle, replacing Tauri's default icon. It is used for the window, the taskbar, and Explorer, and has a simplified version for 16 and 24 px. The installer file now shows it too, instead of the default NSIS icon.
- The brand mark in the top bar is now the Glint icon. The old red rounded square with a white play triangle looked too much like YouTube's logo.
- The README shows the logo and explains how to regenerate the icons.

## [0.1.2] - 2026-10-24

### Changed

- The control bar now matches the YouTube player: 24px icons on YouTube's grid, a larger volume icon, a rounded CC box, an outlined settings gear, new theater and fullscreen icons, and YouTube's spacing.
- The progress bar is split into chapter segments with gaps, and the hovered chapter grows.
- The play/pause button morphs between its two icons.
- Arabic text falls back to Arial, as on YouTube.
- The MIT license was added, and Adham Yasser is now the author and the installer publisher.

### Fixed

- Play/pause, seek, and loading animations now run even when Windows **Animation effects** is off. Only menu slide and fade effects are reduced.

## 0.1.1 - 2026-10-24

### Fixed

- The play/pause icon in the center of the video stayed on screen when Windows **Animation effects** was off. It now always hides after half a second.

## 0.1.0 - 2026-10-24

### Added

- First release: a Windows video player with YouTube-style controls and keyboard shortcuts.
- Open files from the File menu, drag-and-drop, the command line, or **Open with** in Explorer. A second launch sends the file to the open window.
- Folder playlist with **Next** (Shift+N).
- Automatic `.srt` / `.vtt` subtitles and `.chapters.json` / `.chapters.vtt` chapters next to the video.
- Saved position, volume, mute, and speed for each file.
- NSIS installer with file associations and WebView2 bootstrapper.

[Unreleased]: https://github.com/Adham-ELtawil/glint/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/Adham-ELtawil/glint/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/Adham-ELtawil/glint/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/Adham-ELtawil/glint/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/Adham-ELtawil/glint/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Adham-ELtawil/glint/releases/tag/v0.1.2
