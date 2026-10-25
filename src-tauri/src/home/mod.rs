//! Everything behind the home screen: the folder list, the folder scanner,
//! and the thumbnail cache. All of it stays on this PC: the folder list
//! lives in the app config folder and thumbnails in the app cache folder.

pub mod folders;
pub mod scan;
pub mod thumbs;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

use self::folders::LibraryConfig;
use self::scan::FolderScan;
use self::thumbs::{ThumbCache, cache_key};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    pub path: String,
    pub name: String,
    pub is_default: bool,
    pub exists: bool,
}

/// What the home screen needs to know about one file: whether it is still
/// there and, if it was seen before, its cached thumbnail and duration.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub path: String,
    pub exists: bool,
    pub size: u64,
    pub modified_ms: u64,
    pub thumbnail: Option<String>,
    pub thumbnail_failed: bool,
    pub duration: Option<f64>,
}

/// Status lookups per call. The home screen asks for visible cards only.
pub const MAX_INFO_BATCH: usize = 200;

pub struct HomeStore {
    config_path: PathBuf,
    default_folder: Option<PathBuf>,
    config: Mutex<LibraryConfig>,
    thumbs: ThumbCache,
}

impl HomeStore {
    pub fn open(config_path: PathBuf, cache_dir: PathBuf, default_folder: Option<PathBuf>) -> Self {
        let config = folders::load(&config_path, default_folder.as_deref());
        Self {
            config_path,
            default_folder,
            config: Mutex::new(config),
            thumbs: ThumbCache::new(cache_dir),
        }
    }

    pub fn folders(&self) -> Vec<FolderInfo> {
        let config = self.config.lock().expect("library config");
        self.describe(&config)
    }

    pub fn add_folder(&self, folder: &Path) -> Result<Vec<FolderInfo>, String> {
        let mut config = self.config.lock().expect("library config");
        let next = folders::add(&config, folder)?;
        if next != *config {
            folders::save(&self.config_path, &next)?;
            *config = next;
        }
        Ok(self.describe(&config))
    }

    pub fn remove_folder(&self, folder: &str) -> Result<Vec<FolderInfo>, String> {
        let mut config = self.config.lock().expect("library config");
        let next = folders::remove(&config, folder);
        if next != *config {
            folders::save(&self.config_path, &next)?;
            *config = next;
        }
        Ok(self.describe(&config))
    }

    /// Scan every folder in the list, in list order. Blocking; call it off
    /// the UI thread.
    pub fn scan(&self) -> Vec<FolderScan> {
        let list = self.config.lock().expect("library config").folders.clone();
        list.iter()
            .map(|folder| {
                let mut result = scan::scan_folder(Path::new(folder));
                result.path = folder.clone();
                result
            })
            .collect()
    }

    pub fn media_info(&self, paths: &[String]) -> Vec<MediaInfo> {
        paths
            .iter()
            .take(MAX_INFO_BATCH)
            .map(|path| self.info_for(path))
            .collect()
    }

    pub fn save_thumbnail(
        &self,
        path: &str,
        jpeg_base64: Option<&str>,
        duration: Option<f64>,
    ) -> Result<(), String> {
        let file = Path::new(path);
        if !crate::library::is_video_path(file) {
            return Err("Thumbnails are only kept for videos.".into());
        }
        let meta = std::fs::metadata(file).map_err(|_| "Couldn't find that file.".to_string())?;
        if !meta.is_file() {
            return Err("Couldn't find that file.".into());
        }
        let key = cache_key(path, meta.len(), scan::modified_ms(&meta));
        self.thumbs.store(&key, jpeg_base64, duration)
    }

    pub fn prune_thumbnails(&self) -> usize {
        self.thumbs.prune(thumbs::MAX_CACHED)
    }

    fn info_for(&self, path: &str) -> MediaInfo {
        let missing = MediaInfo {
            path: path.to_string(),
            exists: false,
            size: 0,
            modified_ms: 0,
            thumbnail: None,
            thumbnail_failed: false,
            duration: None,
        };
        let Ok(meta) = std::fs::metadata(path) else {
            return missing;
        };
        if !meta.is_file() {
            return missing;
        }
        let size = meta.len();
        let modified_ms = scan::modified_ms(&meta);
        let cached = self.thumbs.lookup(&cache_key(path, size, modified_ms));
        MediaInfo {
            path: path.to_string(),
            exists: true,
            size,
            modified_ms,
            thumbnail: cached.data_url,
            thumbnail_failed: cached.failed,
            duration: cached.duration,
        }
    }

    fn describe(&self, config: &LibraryConfig) -> Vec<FolderInfo> {
        let default = self
            .default_folder
            .as_ref()
            .map(|path| folders::clean(path).to_string_lossy().to_string());
        config
            .folders
            .iter()
            .map(|folder| {
                let path = Path::new(folder);
                FolderInfo {
                    path: folder.clone(),
                    name: scan::display_name(path),
                    is_default: default
                        .as_deref()
                        .is_some_and(|default| folders::same_path(default, folder)),
                    exists: path.is_dir(),
                }
            })
            .collect()
    }
}

#[cfg(test)]
pub(crate) fn test_dir(label: &str) -> PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let unique = format!(
        "glint-{label}-{}-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let dir = std::env::temp_dir().join(unique);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;

    #[test]
    fn end_to_end_folders_scan_and_thumbnails() {
        let dir = test_dir("home-e2e");
        let videos = dir.join("Videos");
        let movies = dir.join("Movies");
        std::fs::create_dir_all(&videos).unwrap();
        std::fs::create_dir_all(&movies).unwrap();
        std::fs::write(videos.join("a.mp4"), b"video").unwrap();
        std::fs::write(movies.join("b.webm"), b"video").unwrap();
        let config = dir.join("config").join("library.json");
        let store = HomeStore::open(config.clone(), dir.join("thumbs"), Some(videos.clone()));

        let listed = store.folders();
        assert_eq!(listed.len(), 1);
        assert!(listed[0].is_default);
        assert_eq!(listed[0].name, "Videos");

        let listed = store.add_folder(&movies).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(!listed[1].is_default);
        assert!(config.is_file());

        let scans = store.scan();
        assert_eq!(scans.len(), 2);
        assert_eq!(scans[0].videos[0].filename, "a.mp4");
        assert_eq!(scans[1].videos[0].filename, "b.webm");

        let a = scans[0].videos[0].path.clone();
        let gone = videos.join("gone.mp4").to_string_lossy().to_string();
        let info = store.media_info(&[a.clone(), gone]);
        assert!(info[0].exists && info[0].thumbnail.is_none() && !info[0].thumbnail_failed);
        assert_eq!(info[0].size, 5);
        assert!(!info[1].exists);

        let jpeg = base64::engine::general_purpose::STANDARD.encode([0xFF, 0xD8, 0xFF, 0xD9]);
        store.save_thumbnail(&a, Some(&jpeg), Some(12.0)).unwrap();
        let info = store.media_info(std::slice::from_ref(&a));
        assert!(
            info[0]
                .thumbnail
                .as_deref()
                .unwrap()
                .starts_with("data:image/jpeg")
        );
        assert_eq!(info[0].duration, Some(12.0));

        // Editing the file changes size and mtime, so the old thumbnail no longer applies.
        std::fs::write(videos.join("a.mp4"), b"video, re-encoded").unwrap();
        assert!(
            store.media_info(std::slice::from_ref(&a))[0]
                .thumbnail
                .is_none()
        );

        assert!(
            store
                .save_thumbnail(&videos.join("x.txt").to_string_lossy(), None, None)
                .is_err()
        );

        // A second launch reads the saved list.
        let listed = store.remove_folder(&listed[0].path).unwrap();
        assert_eq!(listed.len(), 1);
        let reopened = HomeStore::open(config, dir.join("thumbs"), Some(videos));
        assert_eq!(reopened.folders().len(), 1);
        assert_eq!(reopened.folders()[0].name, "Movies");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
