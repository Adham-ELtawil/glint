mod commands;
mod library;
mod media_server;
mod paths;
mod range;

use std::sync::Mutex;

use tauri::Emitter;
use tauri::Manager;

use crate::commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch_files = paths::collect_open_paths(
        std::env::args().skip(1),
        &std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")),
    );
    let media = media_server::MediaServer::start().expect("start media server");
    let state = AppState {
        media,
        launch_files: Mutex::new(launch_files),
    };

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let files = paths::collect_open_paths(args, std::path::Path::new(&cwd));
            if files.is_empty() {
                let _ = app.emit("glint-focus", ());
            } else if let Err(err) = app.emit("glint-open", &files) {
                eprintln!("failed to forward open request: {err}");
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::open_video,
            commands::read_subtitle,
            commands::take_launch_files
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Glint");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
