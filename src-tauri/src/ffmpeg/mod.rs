//! Bundled FFmpeg (LGPL build) for files the webview can't play on its own.
//!
//! `ffprobe` decides how a file plays ([`plan`]); `ffmpeg` then streams a
//! fragmented MP4 that the player feeds to Media Source Extensions. Both run
//! as separate executables next to `glint.exe`, with no console window, and
//! die with Glint (see [`process`]).

pub mod args;
pub mod plan;
pub mod probe;
pub mod process;

use std::path::PathBuf;

/// Where ffmpeg.exe / ffprobe.exe live.
///
/// Installed builds have them beside the app (Tauri `externalBin`, which also
/// copies them next to the dev binary). `GLINT_FFMPEG_DIR` overrides it for
/// local testing.
pub fn tool_path(name: &str) -> Option<PathBuf> {
    let file = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    if let Some(dir) = std::env::var_os("GLINT_FFMPEG_DIR") {
        let candidate = PathBuf::from(dir).join(&file);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.parent()?.join(&file);
    candidate.is_file().then_some(candidate)
}

/// The two tools, found once at startup.
#[derive(Debug, Clone, Default)]
pub struct Tools {
    pub ffmpeg: Option<PathBuf>,
    pub ffprobe: Option<PathBuf>,
}

impl Tools {
    pub fn locate() -> Self {
        Self {
            ffmpeg: tool_path("ffmpeg"),
            ffprobe: tool_path("ffprobe"),
        }
    }

    pub fn available(&self) -> bool {
        self.ffmpeg.is_some() && self.ffprobe.is_some()
    }
}
