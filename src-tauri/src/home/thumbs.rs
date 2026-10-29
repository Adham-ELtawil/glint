//! Disk cache for home-screen thumbnails. The webview grabs a frame and
//! hands Glint a small JPEG; it is stored under the app cache directory,
//! keyed by the file's path, size, and modification time, so a replaced or
//! edited file gets a fresh thumbnail and an unchanged one never costs a
//! second decode. A failed grab is cached too, so formats the webview cannot
//! decode are not retried on every launch.

use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::{Deserialize, Serialize};

/// Largest JPEG accepted from the webview.
pub const MAX_THUMBNAIL_BYTES: usize = 1_500_000;
/// Thumbnails kept when the cache is pruned at startup (oldest go first).
pub const MAX_CACHED: usize = 2_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ThumbMeta {
    #[serde(default)]
    pub failed: bool,
    #[serde(default)]
    pub duration: Option<f64>,
    /// Set by Glint 0.2.0+, which tries its bundled ffmpeg before giving up.
    /// Failures saved by older versions (webview only) are retried once.
    #[serde(default)]
    pub ffmpeg: bool,
}

/// Stable across Rust versions and platforms (unlike `DefaultHasher`):
/// 64-bit FNV-1a over the path, size, and mtime. Windows paths are
/// case-insensitive, so they are folded first.
pub fn cache_key(path: &str, size: u64, modified_ms: u64) -> String {
    let folded = if cfg!(windows) {
        path.to_lowercase()
    } else {
        path.to_string()
    };
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let mut feed = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0100_0000_01b3);
        }
    };
    feed(folded.as_bytes());
    feed(&[0]);
    feed(&size.to_le_bytes());
    feed(&modified_ms.to_le_bytes());
    format!("{hash:016x}")
}

pub struct ThumbCache {
    dir: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct CachedThumb {
    pub data_url: Option<String>,
    pub failed: bool,
    pub duration: Option<f64>,
}

impl ThumbCache {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn lookup(&self, key: &str) -> CachedThumb {
        let meta: ThumbMeta = std::fs::read(self.meta_path(key))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let data_url = if meta.failed {
            None
        } else {
            std::fs::read(self.image_path(key))
                .ok()
                .filter(|bytes| is_jpeg(bytes))
                .map(|bytes| {
                    format!(
                        "data:image/jpeg;base64,{}",
                        base64::engine::general_purpose::STANDARD.encode(bytes)
                    )
                })
        };
        CachedThumb {
            failed: meta.failed && meta.ffmpeg && data_url.is_none(),
            duration: meta
                .duration
                .filter(|value| value.is_finite() && *value > 0.0),
            data_url,
        }
    }

    /// Store a thumbnail (base64 JPEG) or, with `None`, remember that the
    /// webview could not decode this file.
    pub fn store(
        &self,
        key: &str,
        jpeg_base64: Option<&str>,
        duration: Option<f64>,
    ) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir)
            .map_err(|_| "Couldn't save the thumbnail.".to_string())?;
        let duration = duration.filter(|value| value.is_finite() && *value > 0.0);
        let meta = match jpeg_base64 {
            Some(encoded) => {
                let payload = encoded
                    .strip_prefix("data:image/jpeg;base64,")
                    .unwrap_or(encoded);
                if payload.len() > MAX_THUMBNAIL_BYTES * 4 / 3 + 4 {
                    return Err("That thumbnail is too large.".into());
                }
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(payload)
                    .map_err(|_| "That thumbnail isn't valid.".to_string())?;
                if bytes.len() > MAX_THUMBNAIL_BYTES || !is_jpeg(&bytes) {
                    return Err("That thumbnail isn't a JPEG.".into());
                }
                write_atomic(&self.image_path(key), &bytes)?;
                ThumbMeta {
                    failed: false,
                    duration,
                    ffmpeg: true,
                }
            }
            None => {
                let _ = std::fs::remove_file(self.image_path(key));
                ThumbMeta {
                    failed: true,
                    duration,
                    ffmpeg: true,
                }
            }
        };
        let json =
            serde_json::to_vec(&meta).map_err(|_| "Couldn't save the thumbnail.".to_string())?;
        write_atomic(&self.meta_path(key), &json)
    }

    /// Keep the newest `keep` entries. Returns how many were removed.
    pub fn prune(&self, keep: usize) -> usize {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return 0;
        };
        let mut metas: Vec<(std::time::SystemTime, String)> = entries
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                    return None;
                }
                let key = path.file_stem()?.to_str()?.to_string();
                let modified = entry.metadata().ok()?.modified().ok()?;
                Some((modified, key))
            })
            .collect();
        if metas.len() <= keep {
            return 0;
        }
        metas.sort_by_key(|entry| std::cmp::Reverse(entry.0));
        let mut removed = 0;
        for (_, key) in metas.into_iter().skip(keep) {
            let _ = std::fs::remove_file(self.image_path(&key));
            if std::fs::remove_file(self.meta_path(&key)).is_ok() {
                removed += 1;
            }
        }
        removed
    }

    fn image_path(&self, key: &str) -> PathBuf {
        self.dir.join(format!("{}.jpg", sanitize(key)))
    }

    fn meta_path(&self, key: &str) -> PathBuf {
        self.dir.join(format!("{}.json", sanitize(key)))
    }
}

/// Keys come from `cache_key`, but never let one escape the cache folder.
fn sanitize(key: &str) -> String {
    key.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(32)
        .collect()
}

fn is_jpeg(bytes: &[u8]) -> bool {
    bytes.len() > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|_| "Couldn't save the thumbnail.".to_string())?;
    std::fs::rename(&tmp, path).map_err(|_| "Couldn't save the thumbnail.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_dir;

    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 0xFF, 0xD9];

    #[test]
    fn cache_key_changes_with_path_size_and_mtime_and_is_stable() {
        let base = cache_key("/v/a.mp4", 10, 1000);
        assert_eq!(base, cache_key("/v/a.mp4", 10, 1000));
        assert_eq!(base.len(), 16);
        assert_ne!(base, cache_key("/v/b.mp4", 10, 1000));
        assert_ne!(base, cache_key("/v/a.mp4", 11, 1000));
        assert_ne!(base, cache_key("/v/a.mp4", 10, 1001));
        // Pinned so a refactor that changes the key (and throws away every
        // user's cache) is a deliberate decision.
        assert_eq!(cache_key("/v/a.mp4", 10, 1000), "bb18b4ff76cb5fdc");
    }

    #[test]
    fn stores_and_reads_back_a_thumbnail_with_duration() {
        let dir = test_dir("thumb-store");
        let cache = ThumbCache::new(dir.join("thumbs"));
        let key = cache_key("/v/a.mp4", 1, 2);
        assert_eq!(cache.lookup(&key), CachedThumb::default());

        let encoded = base64::engine::general_purpose::STANDARD.encode(JPEG);
        cache
            .store(
                &key,
                Some(&format!("data:image/jpeg;base64,{encoded}")),
                Some(93.5),
            )
            .unwrap();
        let hit = cache.lookup(&key);
        assert_eq!(
            hit.data_url,
            Some(format!("data:image/jpeg;base64,{encoded}"))
        );
        assert_eq!(hit.duration, Some(93.5));
        assert!(!hit.failed);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn remembers_failures_and_rejects_bad_payloads() {
        let dir = test_dir("thumb-fail");
        let cache = ThumbCache::new(dir.clone());
        let key = cache_key("/v/a.mkv", 1, 2);
        cache.store(&key, None, None).unwrap();
        assert!(cache.lookup(&key).failed);
        assert!(cache.store(&key, Some("not base64!!"), None).is_err());
        let png = base64::engine::general_purpose::STANDARD.encode([0x89, b'P', b'N', b'G']);
        assert!(cache.store(&key, Some(&png), None).is_err());
        let huge = "A".repeat(MAX_THUMBNAIL_BYTES * 2);
        assert!(cache.store(&key, Some(&huge), None).is_err());
        // A later success replaces the failure marker.
        let encoded = base64::engine::general_purpose::STANDARD.encode(JPEG);
        cache.store(&key, Some(&encoded), Some(f64::NAN)).unwrap();
        let hit = cache.lookup(&key);
        assert!(!hit.failed);
        assert!(hit.data_url.is_some());
        assert_eq!(hit.duration, None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn retries_failures_saved_before_ffmpeg() {
        let dir = test_dir("thumb-old-fail");
        let cache = ThumbCache::new(dir.clone());
        let key = cache_key("/v/old.mkv", 1, 2);
        std::fs::create_dir_all(&dir).unwrap();
        // What Glint 0.1.x wrote when the webview couldn't decode a file.
        std::fs::write(dir.join(format!("{key}.json")), br#"{"failed":true}"#).unwrap();
        assert!(!cache.lookup(&key).failed);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn keys_cannot_escape_the_cache_folder() {
        let dir = test_dir("thumb-escape");
        let cache = ThumbCache::new(dir.join("inner"));
        cache.store("../../evil", None, None).unwrap();
        assert!(dir.join("inner").join("evil.json").is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_keeps_the_newest_entries() {
        let dir = test_dir("thumb-prune");
        let cache = ThumbCache::new(dir.clone());
        let encoded = base64::engine::general_purpose::STANDARD.encode(JPEG);
        for i in 0..5_u64 {
            let key = cache_key("/v/x.mp4", i, i);
            cache.store(&key, Some(&encoded), None).unwrap();
            let meta = dir.join(format!("{key}.json"));
            let file = std::fs::File::options().write(true).open(&meta).unwrap();
            file.set_modified(
                std::time::SystemTime::now() - std::time::Duration::from_secs(100 - i),
            )
            .unwrap();
        }
        assert_eq!(cache.prune(2), 3);
        assert!(
            cache
                .lookup(&cache_key("/v/x.mp4", 4, 4))
                .data_url
                .is_some()
        );
        assert!(
            cache
                .lookup(&cache_key("/v/x.mp4", 3, 3))
                .data_url
                .is_some()
        );
        assert!(
            cache
                .lookup(&cache_key("/v/x.mp4", 0, 0))
                .data_url
                .is_none()
        );
        assert_eq!(cache.prune(2), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
