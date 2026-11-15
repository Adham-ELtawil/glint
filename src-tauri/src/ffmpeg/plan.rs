//! Decides how a probed file plays: straight in the webview, or through ffmpeg.

use super::probe::{Probe, VideoStream};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// The webview opens the file itself.
    Native,
    /// Container and video are fine; only the audio is converted to AAC.
    Audio,
    /// Repackaged into fragmented MP4 (codecs copied, audio converted if needed).
    Remux,
    /// The video codec itself is re-encoded to H.264.
    Video,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Native => "native",
            Mode::Audio => "audio",
            Mode::Remux => "remux",
            Mode::Video => "video",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoAction {
    None,
    Copy { hevc: bool },
    Encode { deinterlace: bool },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioAction {
    /// Index among the file's audio streams (`-map 0:a:N`).
    pub stream: usize,
    pub copy: bool,
    /// Output channels: 1, 2, or 6 (5.1). Chrome's MSE parser rejects AAC with
    /// unusual layouts such as `5.1(side)`, so anything wider becomes plain 5.1.
    pub channels: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Plan {
    pub mode: Mode,
    pub video: VideoAction,
    pub audio: Option<AudioAction>,
}

/// Audio the webview decodes in MP4/MKV/WebM.
const NATIVE_AUDIO: &[&str] = &["aac", "mp3", "flac", "opus", "vorbis"];

fn native_container(format_name: &str) -> bool {
    format_name.starts_with("mov,mp4") || format_name.starts_with("matroska")
}

fn eight_bit_420(video: &VideoStream) -> bool {
    matches!(video.pix_fmt.as_str(), "yuv420p" | "yuvj420p" | "nv12" | "")
}

/// Video the webview decodes, both from a file and through MSE in fragmented MP4.
fn copyable_video(video: &VideoStream) -> bool {
    match video.codec.as_str() {
        // Chromium only decodes 8-bit 4:2:0 H.264.
        "h264" => eight_bit_420(video),
        "hevc" | "av1" | "vp9" => true,
        _ => false,
    }
}

fn native_video(video: &VideoStream) -> bool {
    copyable_video(video) || video.codec == "vp8"
}

/// The audio stream played by default: the one flagged default, else the first.
pub fn default_audio(probe: &Probe) -> Option<usize> {
    if probe.audio.is_empty() {
        return None;
    }
    Some(probe.audio.iter().position(|a| a.default).unwrap_or(0))
}

fn output_channels(input: u32) -> u32 {
    match input {
        0 | 2 => 2,
        1 => 1,
        3.. => 6,
    }
}

/// Whether ffmpeg can produce this stream's audio: AAC is copied untouched,
/// anything else has to be decoded by the bundled build.
fn audio_usable(audio: &super::probe::AudioStream) -> bool {
    audio_copyable(audio) || audio.decodable
}

fn audio_copyable(audio: &super::probe::AudioStream) -> bool {
    audio.codec == "aac" && audio.channels <= 2
}

/// The audio stream ffmpeg plays: the default one if Glint can decode it,
/// else the first one it can. None when no audio track is usable.
pub fn playable_audio(probe: &Probe) -> Option<usize> {
    let preferred = default_audio(probe)?;
    if audio_usable(&probe.audio[preferred]) {
        return Some(preferred);
    }
    probe.audio.iter().position(audio_usable)
}

/// A stream Glint's ffmpeg has no decoder for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Unsupported {
    /// An audio-only file whose audio can't be decoded: nothing to play.
    Audio { codec: String },
    /// Video that has to be converted but can't be decoded.
    Video { codec: String },
}

/// Why an ffmpeg `plan` can't play the file at all, if it can't.
pub fn unsupported(probe: &Probe, plan: &Plan) -> Option<Unsupported> {
    if plan.mode == Mode::Native {
        return None;
    }
    if let (VideoAction::Encode { .. }, Some(video)) = (plan.video, probe.video.as_ref())
        && !video.decodable
    {
        return Some(Unsupported::Video {
            codec: video.codec.clone(),
        });
    }
    if plan.video == VideoAction::None && plan.audio.is_none() {
        let index = default_audio(probe)?;
        return Some(Unsupported::Audio {
            codec: probe.audio[index].codec.clone(),
        });
    }
    None
}

/// A video whose audio Glint can't decode plays without sound; this is the
/// codec it had to leave out, so the player can say so.
pub fn dropped_audio(probe: &Probe, plan: &Plan) -> Option<String> {
    if plan.mode == Mode::Native || plan.video == VideoAction::None || plan.audio.is_some() {
        return None;
    }
    default_audio(probe).map(|index| probe.audio[index].codec.clone())
}

/// `force_remux` builds the ffmpeg plan for a file that should have played
/// natively but didn't (the player's fallback).
pub fn plan(probe: &Probe, force_remux: bool) -> Plan {
    let audio_index = default_audio(probe);
    let audio_stream = audio_index.map(|i| &probe.audio[i]);

    let video_native = probe.video.as_ref().is_none_or(native_video);
    let audio_native = audio_stream.is_none_or(|a| NATIVE_AUDIO.contains(&a.codec.as_str()));
    let container_native = native_container(&probe.format_name);

    if !force_remux && container_native && video_native && audio_native {
        return Plan {
            mode: Mode::Native,
            video: VideoAction::None,
            audio: None,
        };
    }

    let video = match &probe.video {
        None => VideoAction::None,
        Some(v) if copyable_video(v) => VideoAction::Copy {
            hevc: v.codec == "hevc",
        },
        Some(v) => VideoAction::Encode {
            deinterlace: v.interlaced,
        },
    };
    let audio = playable_audio(probe).map(|stream| {
        let a = &probe.audio[stream];
        AudioAction {
            stream,
            copy: audio_copyable(a),
            channels: output_channels(a.channels),
        }
    });
    let mode = if matches!(video, VideoAction::Encode { .. }) {
        Mode::Video
    } else if container_native && !force_remux && video_native {
        Mode::Audio
    } else {
        Mode::Remux
    };
    Plan { mode, video, audio }
}

/// For HEVC, which the webview decodes only with Microsoft's HEVC Video
/// Extensions and a hardware decoder: the plan that converts the video to
/// H.264, for when copying it fails on this PC.
pub fn transcode(probe: &Probe) -> Option<Plan> {
    let video = probe.video.as_ref().filter(|v| v.codec == "hevc")?;
    let copy = plan(probe, true);
    Some(Plan {
        mode: Mode::Video,
        video: VideoAction::Encode {
            deinterlace: video.interlaced,
        },
        audio: copy.audio,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffmpeg::probe::{AudioStream, Probe, VideoStream};

    fn probe(format: &str, video: Option<(&str, &str)>, audio: &[(&str, u32)]) -> Probe {
        Probe {
            format_name: format.into(),
            duration: 15.0,
            start_time: 0.0,
            video: video.map(|(codec, pix)| VideoStream {
                codec: codec.into(),
                pix_fmt: pix.into(),
                width: 1280,
                height: 720,
                interlaced: false,
                decodable: true,
            }),
            audio: audio
                .iter()
                .map(|(codec, channels)| AudioStream {
                    codec: (*codec).into(),
                    channels: *channels,
                    language: None,
                    title: None,
                    default: false,
                    decodable: true,
                })
                .collect(),
            subtitles: vec![],
        }
    }

    const MP4: &str = "mov,mp4,m4a,3gp,3g2,mj2";
    const MKV: &str = "matroska,webm";

    #[test]
    fn matches_the_windows_test_matrix() {
        let cases: Vec<(&str, Probe, Mode)> = vec![
            (
                "01 mp4 h264 aac",
                probe(MP4, Some(("h264", "yuv420p")), &[("aac", 2)]),
                Mode::Native,
            ),
            (
                "02 mp4 hevc aac",
                probe(MP4, Some(("hevc", "yuv420p")), &[("aac", 2)]),
                Mode::Native,
            ),
            (
                "03 mkv hevc10 aac",
                probe(MKV, Some(("hevc", "yuv420p10le")), &[("aac", 2)]),
                Mode::Native,
            ),
            (
                "04 mkv hevc eac3",
                probe(MKV, Some(("hevc", "yuv420p")), &[("eac3", 2)]),
                Mode::Audio,
            ),
            (
                "05 mkv h264 flac",
                probe(MKV, Some(("h264", "yuv420p")), &[("flac", 2)]),
                Mode::Native,
            ),
            (
                "07 webm vp9 opus",
                probe(MKV, Some(("vp9", "yuv420p")), &[("opus", 2)]),
                Mode::Native,
            ),
            (
                "08 mkv av1 opus",
                probe(MKV, Some(("av1", "yuv420p")), &[("opus", 2)]),
                Mode::Native,
            ),
            (
                "10 avi xvid mp3",
                probe("avi", Some(("mpeg4", "yuv420p")), &[("mp3", 2)]),
                Mode::Video,
            ),
            (
                "12 wmv",
                probe("asf", Some(("wmv2", "yuv420p")), &[("wmav2", 2)]),
                Mode::Video,
            ),
            (
                "13 flv h264 aac",
                probe("flv", Some(("h264", "yuv420p")), &[("aac", 2)]),
                Mode::Remux,
            ),
            (
                "14 mpg mpeg2",
                probe("mpeg", Some(("mpeg2video", "yuv420p")), &[("mp2", 2)]),
                Mode::Video,
            ),
            (
                "15 ts h264 ac3",
                probe("mpegts", Some(("h264", "yuv420p")), &[("ac3", 2)]),
                Mode::Remux,
            ),
            (
                "19 mkv truehd",
                probe(MKV, Some(("h264", "yuv420p")), &[("truehd", 8)]),
                Mode::Audio,
            ),
            (
                "h264 10-bit",
                probe(MKV, Some(("h264", "yuv420p10le")), &[("aac", 2)]),
                Mode::Video,
            ),
            (
                "audio only ac3",
                probe(MKV, None, &[("ac3", 6)]),
                Mode::Audio,
            ),
        ];
        for (name, p, mode) in cases {
            assert_eq!(plan(&p, false).mode, mode, "{name}");
        }
    }

    #[test]
    fn audio_actions() {
        let p = probe(MKV, Some(("h264", "yuv420p")), &[("dts", 6)]);
        let plan = plan(&p, false);
        assert_eq!(plan.video, VideoAction::Copy { hevc: false });
        assert_eq!(
            plan.audio,
            Some(AudioAction {
                stream: 0,
                copy: false,
                channels: 6
            })
        );
        let ts = probe("mpegts", Some(("hevc", "yuv420p")), &[("aac", 2)]);
        let ts_plan = super::plan(&ts, false);
        assert_eq!(ts_plan.video, VideoAction::Copy { hevc: true });
        assert!(ts_plan.audio.unwrap().copy);
        assert_eq!(output_channels(1), 1);
        assert_eq!(output_channels(8), 6);
    }

    #[test]
    fn picks_the_default_audio_stream() {
        let mut p = probe(MKV, Some(("h264", "yuv420p")), &[("aac", 2), ("ac3", 6)]);
        assert_eq!(default_audio(&p), Some(0));
        p.audio[1].default = true;
        assert_eq!(default_audio(&p), Some(1));
        assert_eq!(plan(&p, false).mode, Mode::Audio);
    }

    #[test]
    fn audio_glint_cant_decode() {
        // Voice-recorder AVI with an audio codec the trimmed build lacks.
        let mut rec = probe("avi", None, &[("adpcm_yamaha", 1)]);
        rec.audio[0].decodable = false;
        let p = plan(&rec, false);
        assert_eq!(p.audio, None);
        assert_eq!(
            unsupported(&rec, &p),
            Some(Unsupported::Audio {
                codec: "adpcm_yamaha".into()
            })
        );
        assert_eq!(dropped_audio(&rec, &p), None);

        // A decodable recording plays.
        let ok = probe("avi", None, &[("adpcm_ima_wav", 1)]);
        let p = plan(&ok, false);
        assert_eq!(p.audio.unwrap().stream, 0);
        assert_eq!(unsupported(&ok, &p), None);

        // A video keeps playing, without sound, and says which codec it dropped.
        let mut movie = probe("avi", Some(("h264", "yuv420p")), &[("adpcm_yamaha", 2)]);
        movie.audio[0].decodable = false;
        let p = plan(&movie, false);
        assert_eq!(p.audio, None);
        assert_eq!(unsupported(&movie, &p), None);
        assert_eq!(dropped_audio(&movie, &p).as_deref(), Some("adpcm_yamaha"));

        // Another track that can be decoded is used instead.
        let mut two = probe(MKV, Some(("h264", "yuv420p")), &[("x", 2), ("ac3", 6)]);
        two.audio[0].decodable = false;
        two.audio[0].default = true;
        let p = plan(&two, false);
        assert_eq!(p.audio.unwrap().stream, 1);
        assert_eq!(dropped_audio(&two, &p), None);

        // AAC is copied, so it needs no decoder.
        let mut aac = probe("flv", Some(("h264", "yuv420p")), &[("aac", 2)]);
        aac.audio[0].decodable = false;
        assert!(plan(&aac, false).audio.unwrap().copy);
    }

    #[test]
    fn video_glint_cant_decode() {
        let mut p = probe("avi", Some(("cinepak", "")), &[("pcm_s16le", 2)]);
        p.video.as_mut().unwrap().decodable = false;
        let chosen = plan(&p, false);
        assert_eq!(
            unsupported(&p, &chosen),
            Some(Unsupported::Video {
                codec: "cinepak".into()
            })
        );
        // Native files are the webview's business.
        let mut native = probe(MP4, Some(("h264", "yuv420p")), &[("aac", 2)]);
        native.video.as_mut().unwrap().decodable = false;
        assert_eq!(unsupported(&native, &plan(&native, false)), None);
    }

    #[test]
    fn force_remux_for_the_native_fallback() {
        let p = probe(MP4, Some(("h264", "yuv420p")), &[("aac", 2)]);
        let forced = plan(&p, true);
        assert_eq!(forced.mode, Mode::Remux);
        assert_eq!(forced.video, VideoAction::Copy { hevc: false });
        assert!(forced.audio.unwrap().copy);
    }

    #[test]
    fn hevc_can_be_converted_when_the_pc_cant_decode_it() {
        let p = probe(MKV, Some(("hevc", "yuv420p10le")), &[("eac3", 6)]);
        let plan = transcode(&p).unwrap();
        assert_eq!(plan.mode, Mode::Video);
        assert_eq!(plan.video, VideoAction::Encode { deinterlace: false });
        assert_eq!(plan.audio.unwrap().channels, 6);
        let aac = probe(MP4, Some(("hevc", "yuv420p")), &[("aac", 2)]);
        assert!(transcode(&aac).unwrap().audio.unwrap().copy);
        assert!(transcode(&probe(MP4, Some(("h264", "yuv420p")), &[("aac", 2)])).is_none());
        assert!(transcode(&probe(MP4, None, &[("aac", 2)])).is_none());
    }
}
