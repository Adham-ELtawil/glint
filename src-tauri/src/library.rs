use std::path::{Path, PathBuf};

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "webm", "mkv", "mov", "avi", "ogv", "ogg", "mpeg", "mpg", "wmv", "flv", "ts",
    "m2ts", "3gp",
];

const SUBTITLE_LIMIT: u64 = 2_000_000;
const CHAPTER_LIMIT: u64 = 1_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubtitlePayload {
    pub path: PathBuf,
    pub filename: String,
    pub format: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct Inspection {
    pub id: String,
    pub filename: String,
    pub path: PathBuf,
    pub extension: String,
    pub playlist: Vec<PathBuf>,
    pub subtitles: Vec<SubtitlePayload>,
    pub chapters_text: Option<String>,
    pub chapters_format: Option<String>,
}

pub fn inspect(path: &Path) -> Result<Inspection, String> {
    if !path.exists() {
        return Err("Couldn't find that file.".into());
    }
    if path.is_dir() {
        return Err("Choose a video file, not a folder.".into());
    }
    let canon = path
        .canonicalize()
        .map_err(|_| "Couldn't read that file.".to_string())?;
    if !canon.is_file() {
        return Err("Choose a video file.".into());
    }
    let filename = file_name(&canon);
    let extension = extension_of(&canon);
    let playlist = sibling_videos(&canon);
    let subtitles = sidecar_subtitles(&canon);
    let (chapters_format, chapters_text) = sidecar_chapters(&canon);
    Ok(Inspection {
        id: canon.to_string_lossy().to_string(),
        filename,
        path: canon,
        extension,
        playlist,
        subtitles,
        chapters_text,
        chapters_format,
    })
}

pub fn read_subtitle(path: &Path) -> Result<SubtitlePayload, String> {
    if !path.is_file() {
        return Err("Couldn't find that subtitle file.".into());
    }
    let format = match extension_of(path).as_str() {
        "srt" => "srt",
        "vtt" => "vtt",
        _ => return Err("Subtitles need to be an .srt or .vtt file.".into()),
    };
    let canon = path
        .canonicalize()
        .map_err(|_| "Couldn't read that subtitle file.".to_string())?;
    let content = read_limited(&canon, SUBTITLE_LIMIT)?;
    Ok(SubtitlePayload {
        filename: file_name(&canon),
        path: canon,
        format: format.to_string(),
        content,
    })
}

fn sibling_videos(video: &Path) -> Vec<PathBuf> {
    let Some(dir) = video.parent() else {
        return vec![video.to_path_buf()];
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![video.to_path_buf()];
    };
    let mut files = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file()
            && is_video_path(&path)
            && let Ok(canon) = path.canonicalize()
        {
            files.push(canon);
        }
    }
    if !files.iter().any(|path| path == video) {
        files.push(video.to_path_buf());
    }
    files.sort_by(|a, b| natural_cmp(&file_name(a), &file_name(b)).then_with(|| a.cmp(b)));
    files
}

fn sidecar_subtitles(video: &Path) -> Vec<SubtitlePayload> {
    let Some(dir) = video.parent() else {
        return Vec::new();
    };
    let Some(stem) = video.file_stem().and_then(|stem| stem.to_str()) else {
        return Vec::new();
    };
    let stem_lower = stem.to_lowercase();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = extension_of(&path);
        if ext != "srt" && ext != "vtt" {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|name| name.to_str()) else {
            continue;
        };
        let name_lower = name.to_lowercase();
        if name_lower.ends_with(".chapters") {
            continue;
        }
        let matches = name_lower == stem_lower || name_lower.starts_with(&format!("{stem_lower}."));
        if !matches {
            continue;
        }
        let Ok(canon) = path.canonicalize() else {
            continue;
        };
        let Ok(content) = read_limited(&canon, SUBTITLE_LIMIT) else {
            continue;
        };
        found.push(SubtitlePayload {
            filename: file_name(&canon),
            path: canon,
            format: ext,
            content,
        });
    }
    found.sort_by(|a, b| {
        subtitle_rank(&a.filename, &stem_lower)
            .cmp(&subtitle_rank(&b.filename, &stem_lower))
            .then_with(|| natural_cmp(&a.filename, &b.filename))
    });
    found
}

fn sidecar_chapters(video: &Path) -> (Option<String>, Option<String>) {
    let Some(dir) = video.parent() else {
        return (None, None);
    };
    let Some(stem) = video.file_stem().and_then(|stem| stem.to_str()) else {
        return (None, None);
    };
    let json = dir.join(format!("{stem}.chapters.json"));
    let vtt = dir.join(format!("{stem}.chapters.vtt"));
    if json.is_file()
        && let Ok(text) = read_limited(&json, CHAPTER_LIMIT)
    {
        return (Some("json".into()), Some(text));
    }
    if vtt.is_file()
        && let Ok(text) = read_limited(&vtt, CHAPTER_LIMIT)
    {
        return (Some("vtt".into()), Some(text));
    }
    (None, None)
}

fn subtitle_rank(filename: &str, stem_lower: &str) -> u8 {
    let lower = filename.to_lowercase();
    let exact = format!("{stem_lower}.vtt");
    let exact_srt = format!("{stem_lower}.srt");
    if lower == exact {
        0
    } else if lower == exact_srt {
        1
    } else if lower.ends_with(".vtt") {
        2
    } else {
        3
    }
}

pub fn is_video_path(path: &Path) -> bool {
    let name = file_name(path);
    if name.starts_with('.') {
        return false;
    }
    VIDEO_EXTENSIONS.contains(&extension_of(path).as_str())
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
}

pub fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "video".to_string())
}

fn read_limited(path: &Path, limit: u64) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|_| "Couldn't read that file.".to_string())?;
    if meta.len() > limit {
        return Err("That file is too large to load as text.".into());
    }
    let bytes = std::fs::read(path).map_err(|_| "Couldn't read that file.".to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let left = a.to_ascii_lowercase();
    let right = b.to_ascii_lowercase();
    let left_bytes = left.as_bytes();
    let right_bytes = right.as_bytes();
    let mut i = 0;
    let mut j = 0;
    while i < left_bytes.len() && j < right_bytes.len() {
        let left_digit = left_bytes[i].is_ascii_digit();
        let right_digit = right_bytes[j].is_ascii_digit();
        if left_digit && right_digit {
            let i_start = i;
            let j_start = j;
            while i < left_bytes.len() && left_bytes[i].is_ascii_digit() {
                i += 1;
            }
            while j < right_bytes.len() && right_bytes[j].is_ascii_digit() {
                j += 1;
            }
            let left_num = trim_zeros(&left_bytes[i_start..i]);
            let right_num = trim_zeros(&right_bytes[j_start..j]);
            match left_num
                .len()
                .cmp(&right_num.len())
                .then(left_num.cmp(right_num))
            {
                std::cmp::Ordering::Equal => {}
                other => return other,
            }
            continue;
        }
        match left_bytes[i].cmp(&right_bytes[j]) {
            std::cmp::Ordering::Equal => {
                i += 1;
                j += 1;
            }
            other => return other,
        }
    }
    left_bytes.len().cmp(&right_bytes.len())
}

fn trim_zeros(bytes: &[u8]) -> &[u8] {
    let trimmed = bytes
        .iter()
        .position(|byte| *byte != b'0')
        .map(|index| &bytes[index..]);
    match trimmed {
        Some(rest) if !rest.is_empty() => rest,
        _ => b"0",
    }
}

#[cfg(test)]
mod tests {
    use super::{inspect, natural_cmp, read_subtitle};
    use std::cmp::Ordering;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn natural_order_puts_2_before_10() {
        assert_eq!(natural_cmp("clip2.mp4", "clip10.mp4"), Ordering::Less);
        assert_eq!(natural_cmp("B.mp4", "a.mp4"), Ordering::Greater);
        assert_eq!(natural_cmp("same.mp4", "same.mp4"), Ordering::Equal);
    }

    #[test]
    fn finds_playlist_subtitles_and_chapters() {
        let dir = std::env::temp_dir().join(format!(
            "glint-lib-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let video = dir.join("Show 2.mp4");
        let later = dir.join("Show 10.mp4");
        let other = dir.join("notes.txt");
        std::fs::write(&video, b"video").unwrap();
        std::fs::write(&later, b"video").unwrap();
        std::fs::write(&other, b"nope").unwrap();
        std::fs::write(
            dir.join("Show 2.srt"),
            b"1\n00:00:01,000 --> 00:00:02,000\nHi\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("Show 2.en.vtt"),
            b"WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nEn\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("Show 2.chapters.json"),
            br#"[{"start":0,"title":"Intro"}]"#,
        )
        .unwrap();
        std::fs::write(dir.join("Show 2.chapters.vtt"), b"WEBVTT\n").unwrap();

        let inspection = inspect(&video).unwrap();
        let names: Vec<_> = inspection
            .playlist
            .iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(
            names,
            vec!["Show 2.mp4".to_string(), "Show 10.mp4".to_string()]
        );
        assert_eq!(inspection.subtitles.len(), 2);
        assert_eq!(inspection.subtitles[0].format, "srt");
        assert!(inspection.subtitles[0].content.contains("Hi"));
        assert_eq!(inspection.chapters_format.as_deref(), Some("json"));
        assert!(inspection.chapters_text.unwrap().contains("Intro"));

        let subtitle = read_subtitle(&dir.join("Show 2.en.vtt")).unwrap();
        assert_eq!(subtitle.format, "vtt");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
