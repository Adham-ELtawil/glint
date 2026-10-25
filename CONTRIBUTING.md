# Contributing to Glint

Thanks for helping. Bug reports, ideas, and pull requests are all welcome.

- **Bugs and ideas:** open an [issue](https://github.com/Adham-ELtawil/glint/issues/new/choose). For a bug, include your Windows version, the Glint version, and the video's format and codecs.
- **Security issues:** don't open a public issue. See [SECURITY.md](SECURITY.md).
- **Questions about a video that won't play:** check [Supported formats](README.md#supported-formats) first.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need [Node.js](https://nodejs.org) 22+ and [Rust](https://rustup.rs) stable. On Windows you also need the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" (see [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/)). The [README](README.md#prerequisites) lists the Linux packages if you develop there.

```bash
git clone https://github.com/Adham-ELtawil/glint.git
cd glint
npm install
npm run tauri dev     # the desktop app with hot reload
npm run dev           # only the UI, in a browser: http://127.0.0.1:43123/?sample=1
```

The [Development](README.md#development) section of the README explains the project structure and how playback works.

## Before you open a pull request

Run everything CI runs:

```bash
npm run lint
npm run format:check
npm test
npm run build

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

`npm run format` and `cargo fmt` fix formatting for you.

If your change touches playback, the window, file associations, or the installer, please also try it on a real Windows PC. CI builds the installers on Windows and uploads them as a build artifact you can download from the run.

## Pull requests

- Keep each pull request to one change. Small ones get reviewed faster.
- Add or update tests. TypeScript tests live in `tests/` (Vitest), Rust tests next to the code in `src-tauri/src`.
- Add user-visible changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), written for users, not developers.
- Update the README when behavior, shortcuts, or supported formats change.
- Keep the look consistent with the YouTube-style player, but don't use YouTube's or Google's name, logo, or red play-button mark in the UI or assets.

## Commit messages

- Write the subject in the imperative and in plain words, about 50–72 characters, no trailing period: `Fix the volume slider collapsing while dragging`.
- Leave a blank line, then explain **why** the change is needed and anything a reviewer should know. Wrap at about 72 characters.
- One logical change per commit. Version bumps go in their own `Release x.y.z` commit.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
