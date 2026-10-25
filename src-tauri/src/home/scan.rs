//! Lists the videos in one library folder. Only that folder and one level of
//! subfolders are read, hidden and system entries are skipped, and both the
//! number of entries visited and the number of videos returned are capped, so
//! a folder pointed at a whole drive still returns quickly.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::library::{file_name, is_video_path};

/// The folder itself is depth 0; its direct subfolders are depth 1.
pub const MAX_DEPTH: usize = 1;
/// Directory entries examined per folder before giving up.
pub const MAX_ENTRIES: usize = 5_000;
/// Videos returned per folder. The newest are kept.
pub const MAX_VIDEOS: usize = 400;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoEntry {
    pub path: String,
    pub filename: String,
    /// Subfolder relative to the library folder, empty at the top level.
    pub subfolder: String,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderScan {
    pub path: String,
    pub name: String,
    pub exists: bool,
    /// True when a cap stopped the scan early.
    pub truncated: bool,
    pub videos: Vec<VideoEntry>,
}

pub fn scan_folder(root: &Path) -> FolderScan {
    let name = display_name(root);
    let mut scan = FolderScan {
        path: root.to_string_lossy().to_string(),
        name,
        exists: root.is_dir(),
        truncated: false,
        videos: Vec::new(),
    };
    if !scan.exists {
        return scan;
    }
    let mut visited = 0_usize;
    let mut pending: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    while let Some((dir, depth)) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited > MAX_ENTRIES {
                scan.truncated = true;
                break;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            let path = entry.path();
            if is_hidden(&path, &meta) {
                continue;
            }
            if file_type.is_dir() {
                // Symlinked or junctioned folders can loop or point anywhere.
                if depth < MAX_DEPTH && !file_type.is_symlink() && !is_reparse_point(&meta) {
                    pending.push((path, depth + 1));
                }
                continue;
            }
            if !meta.is_file() || meta.len() == 0 || !is_video_path(&path) {
                continue;
            }
            scan.videos.push(VideoEntry {
                filename: file_name(&path),
                subfolder: relative_dir(root, &path),
                path: path.to_string_lossy().to_string(),
                size: meta.len(),
                modified_ms: modified_ms(&meta),
            });
        }
        if scan.truncated {
            break;
        }
    }
    sort_newest_first(&mut scan.videos);
    if scan.videos.len() > MAX_VIDEOS {
        scan.videos.truncate(MAX_VIDEOS);
        scan.truncated = true;
    }
    scan
}

/// Newest first, the way YouTube orders an upload list. Ties fall back to
/// natural filename order so the result is stable.
pub fn sort_newest_first(videos: &mut [VideoEntry]) {
    videos.sort_by(|a, b| {
        b.modified_ms
            .cmp(&a.modified_ms)
            .then_with(|| crate::library::natural_cmp(&a.filename, &b.filename))
            .then_with(|| a.path.cmp(&b.path))
    });
}

pub fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

pub fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

fn relative_dir(root: &Path, file: &Path) -> String {
    file.parent()
        .and_then(|parent| parent.strip_prefix(root).ok())
        .map(|rel| rel.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Dot files everywhere, `$RECYCLE.BIN`-style names, and on Windows anything
/// with the hidden or system attribute.
pub fn is_hidden(path: &Path, meta: &std::fs::Metadata) -> bool {
    let name = file_name(path);
    if name.starts_with('.') || name.starts_with('$') || name.starts_with('~') {
        return true;
    }
    has_hidden_attribute(meta)
}

#[cfg(windows)]
fn has_hidden_attribute(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    meta.file_attributes() & (HIDDEN | SYSTEM) != 0
}

#[cfg(not(windows))]
fn has_hidden_attribute(_meta: &std::fs::Metadata) -> bool {
    false
}

#[cfg(windows)]
fn is_reparse_point(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const REPARSE_POINT: u32 = 0x400;
    meta.file_attributes() & REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_reparse_point(_meta: &std::fs::Metadata) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_dir;
    use std::time::{Duration, SystemTime};

    fn touch(path: &Path, bytes: &[u8], age_secs: u64) {
        std::fs::write(path, bytes).unwrap();
        let file = std::fs::File::options().write(true).open(path).unwrap();
        file.set_modified(SystemTime::now() - Duration::from_secs(age_secs))
            .unwrap();
    }

    #[test]
    fn lists_only_visible_videos_one_level_deep_newest_first() {
        let root = test_dir("scan-basic");
        let sub = root.join("Series");
        let deep = sub.join("Season 1");
        let hidden_dir = root.join(".cache");
        std::fs::create_dir_all(&deep).unwrap();
        std::fs::create_dir_all(&hidden_dir).unwrap();
        std::fs::create_dir_all(root.join("$RECYCLE.BIN")).unwrap();

        touch(&root.join("old.mp4"), b"video", 300);
        touch(&root.join("new.webm"), b"video", 10);
        touch(&root.join("Clip 2.mkv"), b"video", 100);
        touch(&root.join("notes.txt"), b"text", 1);
        touch(&root.join("cover.jpg"), b"img", 1);
        touch(&root.join(".secret.mp4"), b"video", 1);
        touch(&root.join("~temp.mp4"), b"video", 1);
        touch(&root.join("empty.mp4"), b"", 1);
        touch(&root.join("NOEXT"), b"video", 1);
        touch(&sub.join("Episode 1.MP4"), b"video", 50);
        touch(&deep.join("too-deep.mp4"), b"video", 5);
        touch(&hidden_dir.join("x.mp4"), b"video", 5);
        touch(&root.join("$RECYCLE.BIN").join("y.mp4"), b"video", 5);

        let scan = scan_folder(&root);
        assert!(scan.exists);
        assert!(!scan.truncated);
        let names: Vec<_> = scan.videos.iter().map(|v| v.filename.as_str()).collect();
        assert_eq!(
            names,
            vec!["new.webm", "Episode 1.MP4", "Clip 2.mkv", "old.mp4"]
        );
        let episode = &scan.videos[1];
        assert_eq!(episode.subfolder, "Series");
        assert_eq!(episode.size, 5);
        assert!(episode.modified_ms > 0);
        assert_eq!(scan.name, display_name(&root));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn missing_folder_reports_not_found() {
        let root = test_dir("scan-missing").join("gone");
        let scan = scan_folder(&root);
        assert!(!scan.exists);
        assert!(scan.videos.is_empty());
        assert_eq!(scan.name, "gone");
    }

    #[test]
    fn caps_the_number_of_videos_and_keeps_the_newest() {
        let root = test_dir("scan-cap");
        for i in 0..(MAX_VIDEOS + 5) {
            touch(
                &root.join(format!("v{i}.mp4")),
                b"v",
                (MAX_VIDEOS + 5 - i) as u64,
            );
        }
        let scan = scan_folder(&root);
        assert_eq!(scan.videos.len(), MAX_VIDEOS);
        assert!(scan.truncated);
        assert_eq!(scan.videos[0].filename, format!("v{}.mp4", MAX_VIDEOS + 4));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_symlinked_folders() {
        let root = test_dir("scan-link");
        let outside = test_dir("scan-link-target");
        touch(&outside.join("elsewhere.mp4"), b"v", 1);
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();
        assert!(scan_folder(&root).videos.is_empty());
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }
}
