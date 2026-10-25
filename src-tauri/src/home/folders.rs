//! The list of folders shown on the home screen, persisted as JSON in the
//! app config directory. The Windows Videos known folder is added the first
//! time Glint runs; after that the list is entirely the user's.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// More folders than this would make the home screen a file manager.
pub const MAX_FOLDERS: usize = 24;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfig {
    #[serde(default)]
    pub folders: Vec<String>,
}

/// Load the saved list. A missing file means first run, which seeds the
/// default folder. A corrupt file is treated the same way rather than failing.
pub fn load(config_path: &Path, default_folder: Option<&Path>) -> LibraryConfig {
    match std::fs::read(config_path) {
        Ok(bytes) => match serde_json::from_slice::<LibraryConfig>(&bytes) {
            Ok(config) => LibraryConfig {
                folders: normalize(config.folders),
            },
            Err(_) => seeded(default_folder),
        },
        Err(_) => seeded(default_folder),
    }
}

/// Write via a temporary file so a crash mid-write never leaves half a file.
pub fn save(config_path: &Path, config: &LibraryConfig) -> Result<(), String> {
    let parent = config_path
        .parent()
        .ok_or_else(|| "Couldn't save the folder list.".to_string())?;
    std::fs::create_dir_all(parent).map_err(|_| "Couldn't save the folder list.".to_string())?;
    let json = serde_json::to_vec_pretty(config)
        .map_err(|_| "Couldn't save the folder list.".to_string())?;
    let tmp = config_path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|_| "Couldn't save the folder list.".to_string())?;
    std::fs::rename(&tmp, config_path).map_err(|_| "Couldn't save the folder list.".to_string())
}

fn seeded(default_folder: Option<&Path>) -> LibraryConfig {
    let folders = default_folder
        .filter(|path| path.is_dir())
        .map(|path| vec![clean(path).to_string_lossy().to_string()])
        .unwrap_or_default();
    LibraryConfig { folders }
}

/// Add a folder. Returns an error message for anything that is not a
/// readable directory, and is a no-op for a folder already in the list.
pub fn add(config: &LibraryConfig, folder: &Path) -> Result<LibraryConfig, String> {
    if !folder.is_dir() {
        return Err("Choose a folder.".into());
    }
    let canon = clean(folder);
    let text = canon.to_string_lossy().to_string();
    if config
        .folders
        .iter()
        .any(|existing| same_path(existing, &text))
    {
        return Ok(config.clone());
    }
    if config.folders.len() >= MAX_FOLDERS {
        return Err(format!("Glint can show up to {MAX_FOLDERS} folders."));
    }
    let mut folders = config.folders.clone();
    folders.push(text);
    Ok(LibraryConfig { folders })
}

pub fn remove(config: &LibraryConfig, folder: &str) -> LibraryConfig {
    LibraryConfig {
        folders: config
            .folders
            .iter()
            .filter(|existing| !same_path(existing, folder))
            .cloned()
            .collect(),
    }
}

fn normalize(folders: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for folder in folders {
        let trimmed = folder.trim();
        if trimmed.is_empty() || out.iter().any(|existing| same_path(existing, trimmed)) {
            continue;
        }
        out.push(trimmed.to_string());
        if out.len() >= MAX_FOLDERS {
            break;
        }
    }
    out
}

/// Canonical form without Windows' `\\?\` verbatim prefix, which would look
/// odd in the UI and would not match paths typed or picked elsewhere.
pub fn clean(path: &Path) -> PathBuf {
    let canon = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let text = canon.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    canon
}

/// Paths compare case-insensitively on Windows, where the file system does.
pub fn same_path(a: &str, b: &str) -> bool {
    let a = a.trim_end_matches(['/', '\\']);
    let b = b.trim_end_matches(['/', '\\']);
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b) || a.to_lowercase() == b.to_lowercase()
    } else {
        a == b
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_dir;

    #[test]
    fn first_run_seeds_the_default_folder_once() {
        let dir = test_dir("cfg-seed");
        let videos = dir.join("Videos");
        std::fs::create_dir_all(&videos).unwrap();
        let path = dir.join("library.json");

        let first = load(&path, Some(&videos));
        // Seeded in canonical form (on Windows the temp dir may be an 8.3 short name).
        assert_eq!(
            first.folders,
            vec![clean(&videos).to_string_lossy().to_string()]
        );

        // The user removes Videos; it must not come back on the next launch.
        let emptied = remove(&first, &first.folders[0]);
        save(&path, &emptied).unwrap();
        assert!(load(&path, Some(&videos)).folders.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_default_folder_seeds_nothing_and_corrupt_file_recovers() {
        let dir = test_dir("cfg-corrupt");
        let path = dir.join("library.json");
        assert!(load(&path, Some(&dir.join("nope"))).folders.is_empty());
        std::fs::write(&path, b"{not json").unwrap();
        let videos = dir.join("V");
        std::fs::create_dir_all(&videos).unwrap();
        assert_eq!(load(&path, Some(&videos)).folders.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn add_dedupes_rejects_files_and_remove_drops() {
        let dir = test_dir("cfg-add");
        let a = dir.join("A");
        let b = dir.join("B");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        std::fs::write(dir.join("file.mp4"), b"x").unwrap();

        let config = LibraryConfig::default();
        let config = add(&config, &a).unwrap();
        let config = add(&config, &a).unwrap();
        assert_eq!(config.folders.len(), 1);
        let config = add(&config, &b).unwrap();
        assert_eq!(config.folders.len(), 2);
        assert!(add(&config, &dir.join("file.mp4")).is_err());
        assert!(add(&config, &dir.join("missing")).is_err());

        let removed = remove(&config, &config.folders[0]);
        assert_eq!(removed.folders, vec![config.folders[1].clone()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saved_list_is_normalized_and_capped() {
        let dir = test_dir("cfg-norm");
        let path = dir.join("library.json");
        let mut folders = vec![" ".to_string(), "/x".to_string(), "/x/".to_string()];
        folders.extend((0..40).map(|i| format!("/f{i}")));
        std::fs::write(
            &path,
            serde_json::to_vec(&LibraryConfig { folders }).unwrap(),
        )
        .unwrap();
        let config = load(&path, None);
        assert_eq!(config.folders.len(), MAX_FOLDERS);
        assert_eq!(config.folders[0], "/x");
        assert_eq!(config.folders[1], "/f0");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn clean_strips_verbatim_prefixes() {
        assert_eq!(
            clean(Path::new(r"\\?\C:\Users\me\Videos-does-not-exist")),
            PathBuf::from(r"C:\Users\me\Videos-does-not-exist")
        );
        assert_eq!(
            clean(Path::new(r"\\?\UNC\server\share\x")),
            PathBuf::from(r"\\server\share\x")
        );
    }
}
