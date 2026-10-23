use std::path::{Path, PathBuf};

/// Pull filesystem paths out of process arguments. Flags are ignored, relative
/// paths resolve against `cwd`, and the running executable is never treated as
/// a video. This is what "Open with" and `glint video.mp4` both arrive as.
pub fn collect_open_paths(
    args: impl IntoIterator<Item = impl AsRef<str>>,
    cwd: &Path,
) -> Vec<String> {
    let exe = std::env::current_exe()
        .ok()
        .and_then(|path| path.canonicalize().ok());
    let mut out = Vec::new();
    for arg in args {
        let arg = arg.as_ref().trim().trim_matches('"');
        if arg.is_empty() || arg.starts_with('-') {
            continue;
        }
        let raw = PathBuf::from(arg);
        let candidate = if raw.is_absolute() {
            raw
        } else {
            cwd.join(raw)
        };
        let Ok(canon) = candidate.canonicalize() else {
            continue;
        };
        if !canon.is_file() {
            continue;
        }
        if exe.as_ref().is_some_and(|exe| exe == &canon) {
            continue;
        }
        let text = canon.to_string_lossy().to_string();
        if !out.contains(&text) {
            out.push(text);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::collect_open_paths;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn keeps_files_and_skips_flags() {
        let dir = std::env::temp_dir().join(format!(
            "glint-args-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("clip.mp4");
        std::fs::write(&file, b"x").unwrap();
        let canon = file.canonicalize().unwrap();

        let found = collect_open_paths(["--flag", "-n", "clip.mp4", "missing.mp4"], &dir);
        assert_eq!(found, vec![canon.to_string_lossy().to_string()]);

        let again = collect_open_paths(
            [
                canon.to_string_lossy().to_string(),
                canon.to_string_lossy().to_string(),
            ],
            &dir,
        );
        assert_eq!(again.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
