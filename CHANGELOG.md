# Changelog

All notable changes to Glint are listed here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Glint uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- New README for users and developers, with a screenshot, install steps, shortcuts, supported formats, FAQ, and a release checklist.
- This changelog.

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

[Unreleased]: https://github.com/Adham-ELtawil/glint/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/Adham-ELtawil/glint/releases/tag/v0.1.2
