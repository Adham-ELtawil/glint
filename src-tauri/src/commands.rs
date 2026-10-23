use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::library::{self, Inspection};
use crate::media_server::MediaServer;

pub struct AppState {
    pub media: MediaServer,
    pub launch_files: Mutex<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDto {
    pub id: String,
    pub filename: String,
    pub path: String,
    pub extension: String,
    pub url: String,
    pub playlist: Vec<PlaylistDto>,
    pub subtitles: Vec<SubtitleDto>,
    pub chapters_text: Option<String>,
    pub chapters_format: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDto {
    pub id: String,
    pub filename: String,
    pub path: String,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleDto {
    pub id: String,
    pub filename: String,
    pub format: String,
    pub content: String,
}

#[tauri::command]
pub fn open_video(state: State<'_, AppState>, path: String) -> Result<OpenedDto, String> {
    let inspection = library::inspect(PathBuf::from(&path).as_path())?;
    to_dto(&state.media, inspection)
}

#[tauri::command]
pub fn read_subtitle(path: String) -> Result<SubtitleDto, String> {
    let subtitle = library::read_subtitle(PathBuf::from(&path).as_path())?;
    Ok(SubtitleDto {
        id: subtitle.path.to_string_lossy().to_string(),
        filename: subtitle.filename,
        format: subtitle.format,
        content: subtitle.content,
    })
}

#[tauri::command]
pub fn take_launch_files(state: State<'_, AppState>) -> Vec<String> {
    let mut files = state.launch_files.lock().expect("launch files");
    std::mem::take(&mut *files)
}

fn to_dto(media: &MediaServer, inspection: Inspection) -> Result<OpenedDto, String> {
    let url = media.register(&inspection.path)?;
    let mut playlist = Vec::with_capacity(inspection.playlist.len());
    for path in inspection.playlist {
        let item_url = match media.register(&path) {
            Ok(url) => url,
            Err(_) => continue,
        };
        let filename = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "video".to_string());
        let id = path.to_string_lossy().to_string();
        playlist.push(PlaylistDto {
            id,
            filename,
            path: path.to_string_lossy().to_string(),
            url: item_url,
        });
    }
    let subtitles = inspection
        .subtitles
        .into_iter()
        .map(|subtitle| SubtitleDto {
            id: subtitle.path.to_string_lossy().to_string(),
            filename: subtitle.filename,
            format: subtitle.format,
            content: subtitle.content,
        })
        .collect();
    Ok(OpenedDto {
        id: inspection.id,
        filename: inspection.filename,
        path: inspection.path.to_string_lossy().to_string(),
        extension: inspection.extension,
        url,
        playlist,
        subtitles,
        chapters_text: inspection.chapters_text,
        chapters_format: inspection.chapters_format,
    })
}
