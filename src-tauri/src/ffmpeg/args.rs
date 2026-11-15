//! The ffmpeg command line for one playback session.
//!
//! The flags were checked against Chrome's MSE: fragmented MP4 whose `tfdt`
//! keeps the source timestamps (`-copyts`, `frag_discont`, no edit list), so a
//! session started with `-ss 600` lands at 600 s on the player's timeline.

use std::path::Path;

use super::plan::{Plan, VideoAction};

/// Added to every timestamp so AAC priming never goes negative (a negative
/// `tfdt` wraps around). The player subtracts it again.
pub const TIMESTAMP_PAD: f64 = 10.0;

/// H.264 encoder for files whose video codec has to be converted.
pub fn video_encoder() -> String {
    if let Ok(name) = std::env::var("GLINT_VIDEO_ENCODER")
        && !name.trim().is_empty()
    {
        return name;
    }
    // Windows' own Media Foundation H.264 encoder: no GPL code, no extra size.
    "h264_mf".into()
}

pub fn session_args(path: &Path, plan: &Plan, start: f64, encoder: &str) -> Vec<String> {
    let mut args: Vec<String> = ["-hide_banner", "-loglevel", "error", "-nostdin"]
        .into_iter()
        .map(String::from)
        .collect();
    if start > 0.0 {
        args.push("-ss".into());
        args.push(format!("{start:.3}"));
    }
    args.push("-copyts".into());
    args.push("-i".into());
    args.push(path.to_string_lossy().into_owned());

    match plan.video {
        VideoAction::None => args.push("-vn".into()),
        VideoAction::Copy { hevc } => {
            args.extend(["-map", "0:v:0", "-c:v", "copy"].map(String::from));
            if hevc {
                // Chromium wants the parameter sets out of band (hvc1).
                args.extend(["-tag:v", "hvc1"].map(String::from));
            }
        }
        VideoAction::Encode { deinterlace } => {
            args.extend(["-map", "0:v:0", "-c:v"].map(String::from));
            args.push(encoder.to_string());
            let mut filters = Vec::new();
            if deinterlace {
                filters.push("yadif");
            }
            filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");
            filters.push("format=nv12");
            args.push("-vf".into());
            args.push(filters.join(","));
            args.extend(["-g", "48"].map(String::from));
            if encoder == "h264_mf" {
                args.extend(["-rate_control", "quality", "-quality", "70"].map(String::from));
            } else {
                args.extend(["-b:v", "8M"].map(String::from));
            }
        }
    }

    match plan.audio {
        None => args.push("-an".into()),
        Some(audio) => {
            args.push("-map".into());
            args.push(format!("0:a:{}", audio.stream));
            if audio.copy {
                args.extend(["-c:a", "copy"].map(String::from));
            } else {
                let (layout, bitrate) = match audio.channels {
                    1 => ("mono", "96k"),
                    6 => ("5.1", "384k"),
                    _ => ("stereo", "192k"),
                };
                args.extend(["-c:a", "aac", "-b:a", bitrate, "-af"].map(String::from));
                let mut filter = format!("aformat=channel_layouts={layout}");
                if matches!(plan.video, VideoAction::None) {
                    // Audio-only files (voice recorder AVIs/WAVs) can carry
                    // broken or gappy timestamps; count them from the samples
                    // instead, starting where the session starts.
                    filter.push_str(",asetpts=N/SR/TB+STARTPTS");
                }
                args.push(filter);
            }
        }
    }

    args.extend(
        [
            "-sn",
            "-dn",
            "-avoid_negative_ts",
            "disabled",
            "-output_ts_offset",
        ]
        .map(String::from),
    );
    args.push(format!("{TIMESTAMP_PAD}"));
    args.extend(
        [
            "-use_editlist",
            "0",
            "-f",
            "mp4",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof+frag_discont",
            "-frag_duration",
            "1000000",
            "pipe:1",
        ]
        .map(String::from),
    );
    args
}

/// Width of the seek-bar preview frames, in pixels (shown at 160 CSS px, so
/// this stays sharp on 150% displays).
pub const PREVIEW_WIDTH: u32 = 240;

/// One small JPEG for the seek-bar preview. Built for speed over precision,
/// like YouTube's storyboards: jump to the keyframe at or before `at` and
/// decode only that keyframe.
pub fn preview_args(path: &Path, at: f64) -> Vec<String> {
    let mut args: Vec<String> = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-skip_frame",
        "nokey",
        "-noaccurate_seek",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    let at = if at.is_finite() { at.max(0.0) } else { 0.0 };
    if at > 0.0 {
        args.push("-ss".into());
        args.push(format!("{at:.3}"));
    }
    args.push("-i".into());
    args.push(path.to_string_lossy().into_owned());
    args.extend(
        [
            "-map",
            "0:v:0",
            "-an",
            "-sn",
            "-dn",
            "-frames:v",
            "1",
            "-vf",
        ]
        .map(String::from),
    );
    args.push(format!("scale={PREVIEW_WIDTH}:-2"));
    args.extend(["-q:v", "5", "-f", "mjpeg", "pipe:1"].map(String::from));
    args
}

/// One JPEG frame for a Home thumbnail.
pub fn thumbnail_args(path: &Path, at: f64) -> Vec<String> {
    let mut args: Vec<String> = ["-hide_banner", "-loglevel", "error", "-nostdin"]
        .into_iter()
        .map(String::from)
        .collect();
    if at > 0.0 {
        args.push("-ss".into());
        args.push(format!("{at:.3}"));
    }
    args.push("-i".into());
    args.push(path.to_string_lossy().into_owned());
    args.extend(
        [
            "-map",
            "0:v:0",
            "-frames:v",
            "1",
            "-vf",
            "scale=480:-2",
            "-q:v",
            "4",
            "-f",
            "mjpeg",
            "pipe:1",
        ]
        .map(String::from),
    );
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffmpeg::plan::{AudioAction, Mode, Plan, VideoAction};

    fn joined(args: &[String]) -> String {
        args.join(" ")
    }

    #[test]
    fn audio_only_conversion_keeps_the_video() {
        let plan = Plan {
            mode: Mode::Audio,
            video: VideoAction::Copy { hevc: true },
            audio: Some(AudioAction {
                stream: 1,
                copy: false,
                channels: 6,
            }),
        };
        let line = joined(&session_args(
            Path::new("/v/movie.mkv"),
            &plan,
            0.0,
            "h264_mf",
        ));
        assert!(!line.contains("-ss"));
        assert!(line.contains("-copyts -i /v/movie.mkv -map 0:v:0 -c:v copy -tag:v hvc1"));
        assert!(line.contains("-map 0:a:1 -c:a aac -b:a 384k -af aformat=channel_layouts=5.1"));
        assert!(line.contains("-avoid_negative_ts disabled -output_ts_offset 10 -use_editlist 0"));
        assert!(line.ends_with(
            "-f mp4 -movflags frag_keyframe+empty_moov+default_base_moof+frag_discont -frag_duration 1000000 pipe:1"
        ));
    }

    #[test]
    fn seeks_and_encodes_video() {
        let plan = Plan {
            mode: Mode::Video,
            video: VideoAction::Encode { deinterlace: true },
            audio: Some(AudioAction {
                stream: 0,
                copy: true,
                channels: 2,
            }),
        };
        let line = joined(&session_args(
            Path::new("/v/old.mpg"),
            &plan,
            75.5,
            "h264_mf",
        ));
        assert!(line.contains("-ss 75.500 -copyts -i /v/old.mpg"));
        assert!(line.contains(
            "-c:v h264_mf -vf yadif,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=nv12 -g 48 -rate_control quality"
        ));
        assert!(line.contains("-map 0:a:0 -c:a copy"));
    }

    #[test]
    fn no_streams_means_no_maps() {
        let plan = Plan {
            mode: Mode::Remux,
            video: VideoAction::None,
            audio: None,
        };
        let args = session_args(Path::new("a.ts"), &plan, 0.0, "x");
        assert!(args.contains(&"-vn".to_string()));
        assert!(args.contains(&"-an".to_string()));
    }

    #[test]
    fn audio_only_files_get_sample_based_timestamps() {
        let plan = Plan {
            mode: Mode::Remux,
            video: VideoAction::None,
            audio: Some(AudioAction {
                stream: 0,
                copy: false,
                channels: 1,
            }),
        };
        let line = joined(&session_args(Path::new("/r/rec.avi"), &plan, 2.0, "x"));
        assert!(line.contains("-ss 2.000 -copyts -i /r/rec.avi -vn -map 0:a:0"));
        assert!(line.contains(
            "-c:a aac -b:a 96k -af aformat=channel_layouts=mono,asetpts=N/SR/TB+STARTPTS"
        ));
    }

    #[test]
    fn preview_jumps_to_a_keyframe_and_stays_small() {
        let line = joined(&preview_args(Path::new("/v/a.mkv"), 61.25));
        assert!(line.starts_with("-hide_banner -loglevel error -nostdin -skip_frame nokey -noaccurate_seek -ss 61.250 -i /v/a.mkv"));
        assert!(line.contains("-map 0:v:0 -an -sn -dn -frames:v 1 -vf scale=240:-2"));
        assert!(line.ends_with("-f mjpeg pipe:1"));
        for bad in [0.0, -3.0, f64::NAN] {
            assert!(!preview_args(Path::new("a"), bad).contains(&"-ss".to_string()));
        }
    }

    #[test]
    fn thumbnail_reads_one_frame() {
        let line = joined(&thumbnail_args(Path::new("/v/a.avi"), 12.0));
        assert!(line.contains("-ss 12.000 -i /v/a.avi -map 0:v:0 -frames:v 1"));
        assert!(line.ends_with("-f mjpeg pipe:1"));
    }
}
