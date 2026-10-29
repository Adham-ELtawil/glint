//! `ffprobe -show_format -show_streams` as JSON, reduced to what playback needs.

use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;

#[derive(Debug, Clone, PartialEq)]
pub struct VideoStream {
    pub codec: String,
    pub pix_fmt: String,
    pub width: u32,
    pub height: u32,
    pub interlaced: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AudioStream {
    pub codec: String,
    pub channels: u32,
    pub language: Option<String>,
    pub title: Option<String>,
    pub default: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SubtitleStream {
    pub codec: String,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Probe {
    /// ffprobe's demuxer list, e.g. `mov,mp4,m4a,3gp,3g2,mj2` or `matroska,webm`.
    pub format_name: String,
    pub duration: f64,
    pub start_time: f64,
    pub video: Option<VideoStream>,
    /// In file order, so index `n` is `-map 0:a:n`.
    pub audio: Vec<AudioStream>,
    pub subtitles: Vec<SubtitleStream>,
}

#[derive(Deserialize)]
struct RawProbe {
    #[serde(default)]
    streams: Vec<RawStream>,
    format: Option<RawFormat>,
}

#[derive(Deserialize)]
struct RawFormat {
    format_name: Option<String>,
    duration: Option<String>,
    start_time: Option<String>,
}

#[derive(Deserialize)]
struct RawStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    pix_fmt: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    channels: Option<u32>,
    field_order: Option<String>,
    duration: Option<String>,
    #[serde(default)]
    disposition: HashMap<String, i64>,
    #[serde(default)]
    tags: HashMap<String, String>,
}

pub fn parse(json: &str) -> Result<Probe, String> {
    let raw: RawProbe =
        serde_json::from_str(json).map_err(|err| format!("Couldn't read the probe: {err}"))?;
    let format = raw.format;
    let number = |value: Option<&String>| {
        value
            .and_then(|text| text.parse::<f64>().ok())
            .filter(|n| n.is_finite())
    };
    let mut duration = format
        .as_ref()
        .and_then(|f| number(f.duration.as_ref()))
        .unwrap_or(0.0);
    let start_time = format
        .as_ref()
        .and_then(|f| number(f.start_time.as_ref()))
        .unwrap_or(0.0);
    let format_name = format
        .as_ref()
        .and_then(|f| f.format_name.clone())
        .unwrap_or_default();

    let mut video = None;
    let mut audio = Vec::new();
    let mut subtitles = Vec::new();
    for stream in raw.streams {
        let codec = stream.codec_name.clone().unwrap_or_default();
        let tag = |key: &str| {
            stream
                .tags
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(key))
                .map(|(_, v)| v.clone())
                .filter(|v| !v.is_empty() && v != "und")
        };
        match stream.codec_type.as_deref() {
            Some("video") => {
                // Cover art in MKV/MP4 shows up as a one-frame video stream.
                let cover = stream.disposition.get("attached_pic").copied().unwrap_or(0) != 0;
                if video.is_none() && !cover {
                    if duration <= 0.0 {
                        duration = number(stream.duration.as_ref()).unwrap_or(0.0);
                    }
                    let field = stream.field_order.clone().unwrap_or_default();
                    video = Some(VideoStream {
                        codec,
                        pix_fmt: stream.pix_fmt.clone().unwrap_or_default(),
                        width: stream.width.unwrap_or(0),
                        height: stream.height.unwrap_or(0),
                        interlaced: matches!(field.as_str(), "tt" | "bb" | "tb" | "bt"),
                    });
                }
            }
            Some("audio") => audio.push(AudioStream {
                codec,
                channels: stream.channels.unwrap_or(2),
                language: tag("language"),
                title: tag("title"),
                default: stream.disposition.get("default").copied().unwrap_or(0) != 0,
            }),
            Some("subtitle") => subtitles.push(SubtitleStream {
                codec,
                language: tag("language"),
                title: tag("title"),
            }),
            _ => {}
        }
    }
    Ok(Probe {
        format_name,
        duration,
        start_time,
        video,
        audio,
        subtitles,
    })
}

/// Runs ffprobe on `path`. Blocking; call it off the UI thread.
pub fn run(ffprobe: &Path, path: &Path) -> Result<Probe, String> {
    let child = super::process::std_command(ffprobe)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|err| format!("Couldn't start ffprobe: {err}"))?;
    super::process::adopt_std(&child);
    let output = child
        .wait_with_output()
        .map_err(|err| format!("ffprobe failed: {err}"))?;
    if !output.status.success() {
        return Err("ffprobe couldn't read that file.".into());
    }
    parse(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn reads_streams_and_skips_cover_art() {
        let json = r#"{
          "streams": [
            {"index":0,"codec_type":"video","codec_name":"mjpeg","disposition":{"attached_pic":1}},
            {"index":1,"codec_type":"video","codec_name":"hevc","pix_fmt":"yuv420p10le","width":1920,"height":1080,"field_order":"progressive","disposition":{"default":1,"attached_pic":0}},
            {"index":2,"codec_type":"audio","codec_name":"dts","channels":6,"disposition":{"default":1},"tags":{"language":"eng","title":"Surround"}},
            {"index":3,"codec_type":"audio","codec_name":"aac","channels":2,"disposition":{"default":0},"tags":{"language":"und"}},
            {"index":4,"codec_type":"subtitle","codec_name":"subrip","tags":{"language":"ara"}}
          ],
          "format": {"format_name":"matroska,webm","duration":"5400.120000","start_time":"0.000000"}
        }"#;
        let probe = parse(json).unwrap();
        assert_eq!(probe.format_name, "matroska,webm");
        assert!((probe.duration - 5400.12).abs() < 1e-9);
        let video = probe.video.unwrap();
        assert_eq!(video.codec, "hevc");
        assert!(!video.interlaced);
        assert_eq!(probe.audio.len(), 2);
        assert_eq!(probe.audio[0].codec, "dts");
        assert_eq!(probe.audio[0].channels, 6);
        assert!(probe.audio[0].default);
        assert_eq!(probe.audio[0].language.as_deref(), Some("eng"));
        assert_eq!(probe.audio[1].language, None);
        assert_eq!(probe.subtitles[0].language.as_deref(), Some("ara"));
    }

    #[test]
    fn tolerates_missing_fields() {
        let probe = parse(r#"{"streams":[{"codec_type":"audio"}]}"#).unwrap();
        assert_eq!(probe.duration, 0.0);
        assert!(probe.video.is_none());
        assert_eq!(probe.audio[0].channels, 2);
        assert!(parse("not json").is_err());
    }
}
