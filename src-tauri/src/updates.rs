//! In-app updates through tauri-plugin-updater.
//!
//! The frontend asks for a check a few seconds after startup and again from
//! **Help → Check for updates…**. A found update is kept here until the user
//! clicks **Update**, which downloads it, verifies its minisign signature
//! against the public key in `tauri.conf.json`, runs the installer, and
//! relaunches Glint. On Windows the NSIS installer runs in passive mode (a
//! small progress window, no questions) and starts Glint again itself.

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Points the updater at another `latest.json`, for testing a release before
/// it is published (for example a local HTTPS server). The URL must use
/// `https`. Updates are still checked against the public key built into the
/// app, so this cannot be used to install anything Glint's key did not sign.
pub const ENDPOINT_ENV: &str = "GLINT_UPDATE_ENDPOINT";

/// The update found by the last check, waiting for the user to accept it.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

/// Reads an endpoint override. Empty means "use the configured endpoint".
pub fn endpoint_override(value: Option<&str>) -> Result<Option<Url>, String> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let url = Url::parse(value).map_err(|err| format!("{ENDPOINT_ENV} is not a URL: {err}"))?;
    if url.scheme() != "https" {
        return Err(format!("{ENDPOINT_ENV} must use https, got {value}"));
    }
    Ok(Some(url))
}

fn describe(update: &Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone().filter(|notes| !notes.trim().is_empty()),
    }
}

/// Checks for a newer version. `None` means Glint is up to date.
#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let mut builder = app.updater_builder();
    let custom = std::env::var(ENDPOINT_ENV).ok();
    if let Some(url) = endpoint_override(custom.as_deref())? {
        builder = builder
            .endpoints(vec![url])
            .map_err(|err| err.to_string())?;
    }
    let updater = builder.build().map_err(|err| err.to_string())?;
    let update = updater.check().await.map_err(|err| err.to_string())?;
    let info = update.as_ref().map(describe);
    *pending.0.lock().unwrap_or_else(|err| err.into_inner()) = update;
    Ok(info)
}

/// Downloads, verifies, and installs the pending update, then relaunches.
/// On Windows the updater exits Glint to run the installer, which relaunches
/// it, so this only returns if something failed.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .take()
        .ok_or_else(|| "No update is ready to install.".to_string())?;
    let mut started = false;
    let result = update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await;
    if let Err(err) = result {
        eprintln!("update to {} failed: {err}", update.version);
        // Keep it so Retry does not need another check.
        *pending.0.lock().unwrap_or_else(|err| err.into_inner()) = Some(update);
        return Err(err.to_string());
    }
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_override_uses_the_configured_endpoint() {
        assert_eq!(endpoint_override(None), Ok(None));
        assert_eq!(endpoint_override(Some("")), Ok(None));
        assert_eq!(endpoint_override(Some("   ")), Ok(None));
    }

    #[test]
    fn an_https_override_is_used() {
        let url = endpoint_override(Some(" https://localhost:8443/latest.json "))
            .unwrap()
            .unwrap();
        assert_eq!(url.as_str(), "https://localhost:8443/latest.json");
    }

    #[test]
    fn plain_http_and_garbage_are_rejected() {
        assert!(endpoint_override(Some("http://127.0.0.1:8000/latest.json")).is_err());
        assert!(endpoint_override(Some("file:///tmp/latest.json")).is_err());
        assert!(endpoint_override(Some("not a url")).is_err());
    }

    #[test]
    fn download_events_match_the_frontend_shape() {
        let started = serde_json::to_value(DownloadEvent::Started {
            content_length: Some(10),
        })
        .unwrap();
        assert_eq!(
            started,
            serde_json::json!({ "event": "started", "data": { "contentLength": 10 } })
        );
        let progress = serde_json::to_value(DownloadEvent::Progress { chunk_length: 4 }).unwrap();
        assert_eq!(
            progress,
            serde_json::json!({ "event": "progress", "data": { "chunkLength": 4 } })
        );
        let finished = serde_json::to_value(DownloadEvent::Finished).unwrap();
        assert_eq!(finished, serde_json::json!({ "event": "finished" }));
    }

    #[test]
    fn update_info_is_camel_case() {
        let info = UpdateInfo {
            version: "0.1.7".into(),
            current_version: "0.1.6".into(),
            notes: None,
        };
        assert_eq!(
            serde_json::to_value(info).unwrap(),
            serde_json::json!({ "version": "0.1.7", "currentVersion": "0.1.6", "notes": null })
        );
    }
}
