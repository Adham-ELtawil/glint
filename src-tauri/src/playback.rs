//! How an opened file plays: natively in the webview, or streamed through
//! ffmpeg. Kept free of Tauri so it can be tested on its own.

use std::path::Path;

use base64::Engine as _;
use serde::Serialize;

use crate::ffmpeg::Tools;
use crate::ffmpeg::args::{TIMESTAMP_PAD, thumbnail_args};
use crate::ffmpeg::plan::{Mode, Plan, VideoAction, plan, transcode};
use crate::ffmpeg::probe::{self, Probe};
use crate::ffmpeg::process;
use crate::media_server::MediaServer;

/// A fragmented-MP4 stream for the MSE player.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDto {
    /// Base URL; the player adds `?t=<seconds>`.
    pub url: String,
    /// `native` never appears here; one of `audio`, `remux`, `video`.
    pub mode: String,
    pub duration: f64,
    /// Seconds to subtract from stream timestamps to get the player's time
    /// (the file's start time plus ffmpeg's `-output_ts_offset` pad).
    pub time_offset: f64,
    pub has_video: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackDto {
    pub mode: String,
    /// Set when `mode` isn't `native`.
    pub stream: Option<StreamDto>,
    /// For native files: the ffmpeg remux to fall back on if the webview
    /// fails to play it after all.
    pub fallback: Option<StreamDto>,
    /// For HEVC: the same file with the video converted to H.264, for PCs
    /// that can't decode HEVC.
    pub transcode: Option<StreamDto>,
}

impl PlaybackDto {
    pub fn native() -> Self {
        Self {
            mode: Mode::Native.as_str().into(),
            stream: None,
            fallback: None,
            transcode: None,
        }
    }
}

fn stream_dto(media: &MediaServer, path: &Path, probe: &Probe, plan: Plan) -> Option<StreamDto> {
    let url = media.register_stream(path, plan).ok()?;
    Some(StreamDto {
        url,
        mode: plan.mode.as_str().into(),
        duration: probe.duration,
        time_offset: probe.start_time + TIMESTAMP_PAD,
        has_video: !matches!(plan.video, VideoAction::None),
    })
}

/// Probes `path` and decides. Without ffmpeg, or if probing fails, the file
/// is handed to the webview as before. Blocking.
pub fn decide(media: &MediaServer, tools: &Tools, path: &Path) -> PlaybackDto {
    let Some(ffprobe) = tools.ffprobe.as_ref() else {
        return PlaybackDto::native();
    };
    if tools.ffmpeg.is_none() {
        return PlaybackDto::native();
    }
    let Ok(probe) = probe::run(ffprobe, path) else {
        return PlaybackDto::native();
    };
    let transcode = transcode(&probe).and_then(|plan| stream_dto(media, path, &probe, plan));
    let chosen = plan(&probe, false);
    if chosen.mode == Mode::Native {
        return PlaybackDto {
            mode: Mode::Native.as_str().into(),
            stream: None,
            fallback: stream_dto(media, path, &probe, plan(&probe, true)),
            transcode,
        };
    }
    match stream_dto(media, path, &probe, chosen) {
        Some(stream) => PlaybackDto {
            mode: stream.mode.clone(),
            stream: Some(stream),
            fallback: None,
            transcode,
        },
        None => PlaybackDto::native(),
    }
}

/// Same spot the webview grabber uses: about 10% in.
fn frame_time(duration: f64) -> f64 {
    if !duration.is_finite() || duration <= 0.0 {
        return 0.0;
    }
    let target = duration * 0.1;
    let floor = (duration / 2.0).min(1.0);
    let ceiling = (duration - 0.25).max(0.0);
    target.max(floor).min(ceiling)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameDto {
    pub data_url: String,
    pub duration: f64,
}

/// A Home thumbnail through ffmpeg, for files the webview can't decode.
pub fn grab_frame(tools: &Tools, path: &Path) -> Result<FrameDto, String> {
    let (Some(ffmpeg), Some(ffprobe)) = (tools.ffmpeg.as_ref(), tools.ffprobe.as_ref()) else {
        return Err("FFmpeg isn't available.".into());
    };
    let probe = probe::run(ffprobe, path)?;
    if probe.video.is_none() {
        return Err("No video track.".into());
    }
    let child = process::std_command(ffmpeg)
        .args(thumbnail_args(path, frame_time(probe.duration)))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|err| format!("Couldn't start ffmpeg: {err}"))?;
    process::adopt_std(&child);
    let output = child
        .wait_with_output()
        .map_err(|err| format!("ffmpeg failed: {err}"))?;
    if !output.status.success() || output.stdout.is_empty() {
        return Err("ffmpeg couldn't read a frame.".into());
    }
    Ok(FrameDto {
        data_url: format!(
            "data:image/jpeg;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&output.stdout)
        ),
        duration: probe.duration,
    })
}

#[cfg(test)]
mod tests {
    use super::frame_time;

    #[test]
    fn frame_time_matches_the_webview_grabber() {
        assert_eq!(frame_time(0.0), 0.0);
        assert_eq!(frame_time(100.0), 10.0);
        assert_eq!(frame_time(4.0), 1.0);
        assert!((frame_time(0.4) - 0.15).abs() < 1e-9);
    }
}
