//! In-app updates through tauri-plugin-updater.
//!
//! The frontend asks for a check a few seconds after startup and again from
//! **Help → Check for updates…**. A found update is kept here until the user
//! clicks **Update**, which downloads it, verifies its minisign signature
//! against the public key in `tauri.conf.json`, runs the installer, and
//! relaunches Glint. On Windows the NSIS installer runs in passive mode (a
//! small progress window, no questions) and starts Glint again itself.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Points the updater at another `latest.json`, for testing a release before
/// it is published (for example a local HTTPS server). The URL must use
/// `https`. Updates are still checked against the public key built into the
/// app, so this cannot be used to install anything Glint's key did not sign.
pub const ENDPOINT_ENV: &str = "GLINT_UPDATE_ENDPOINT";

/// The manifest of the latest published GitHub release. Same as
/// `plugins.updater.endpoints` in `tauri.conf.json` (a test checks).
pub const RELEASE_ENDPOINT: &str =
    "https://github.com/Adham-ELtawil/glint/releases/latest/download/latest.json";

const CHECK_TIMEOUT: Duration = Duration::from_secs(20);

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

/// Why a check failed, so the UI can word it.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CheckErrorKind {
    /// No connection, DNS failure, refused connection, or timeout.
    Network,
    /// Anything else: a server error, a malformed manifest, a bad signature.
    Other,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CheckError {
    pub kind: CheckErrorKind,
    pub message: String,
}

impl CheckError {
    fn other(message: impl ToString) -> Self {
        Self {
            kind: CheckErrorKind::Other,
            message: message.to_string(),
        }
    }
}

/// What a failed `check()` means.
#[derive(Debug, PartialEq, Eq)]
enum Failure {
    Known(CheckErrorKind),
    /// The updater only says the endpoint gave no usable release; look at the
    /// HTTP status to find out whether nothing is published yet.
    NeedsProbe,
}

fn classify_reqwest(err: &reqwest::Error) -> CheckErrorKind {
    if err.is_connect() || err.is_timeout() {
        CheckErrorKind::Network
    } else {
        CheckErrorKind::Other
    }
}

fn classify(err: &tauri_plugin_updater::Error) -> Failure {
    use tauri_plugin_updater::Error;
    match err {
        Error::Reqwest(err) => Failure::Known(classify_reqwest(err)),
        Error::ReleaseNotFound => Failure::NeedsProbe,
        _ => Failure::Known(CheckErrorKind::Other),
    }
}

/// The outcome of looking at the endpoint's HTTP status directly.
#[derive(Debug, PartialEq, Eq)]
enum Probe {
    /// 404 or 410: no release has a manifest yet, so there is nothing newer.
    NotPublished,
    Failed(CheckErrorKind),
}

fn probe_status(status: reqwest::StatusCode) -> Probe {
    match status {
        reqwest::StatusCode::NOT_FOUND | reqwest::StatusCode::GONE => Probe::NotPublished,
        _ => Probe::Failed(CheckErrorKind::Other),
    }
}

async fn probe(url: &Url) -> Probe {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = match reqwest::Client::builder().timeout(CHECK_TIMEOUT).build() {
        Ok(client) => client,
        Err(_) => return Probe::Failed(CheckErrorKind::Other),
    };
    match client.get(url.clone()).send().await {
        Ok(response) => probe_status(response.status()),
        Err(err) => Probe::Failed(classify_reqwest(&err)),
    }
}

fn describe(update: &Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone().filter(|notes| !notes.trim().is_empty()),
    }
}

/// Checks for a newer version. `None` means Glint is up to date, which
/// includes "no release has published an update manifest yet" (a 404).
#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, CheckError> {
    let custom = std::env::var(ENDPOINT_ENV).ok();
    let url = match endpoint_override(custom.as_deref()).map_err(CheckError::other)? {
        Some(url) => url,
        None => Url::parse(RELEASE_ENDPOINT).map_err(CheckError::other)?,
    };
    let updater = app
        .updater_builder()
        .endpoints(vec![url.clone()])
        .map_err(CheckError::other)?
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(CheckError::other)?;
    let update = match updater.check().await {
        Ok(update) => update,
        Err(err) => {
            let kind = match classify(&err) {
                Failure::Known(kind) => kind,
                Failure::NeedsProbe => match probe(&url).await {
                    Probe::NotPublished => {
                        *pending.0.lock().unwrap_or_else(|err| err.into_inner()) = None;
                        return Ok(None);
                    }
                    Probe::Failed(kind) => kind,
                },
            };
            eprintln!("update check failed ({kind:?}): {err}");
            return Err(CheckError {
                kind,
                message: err.to_string(),
            });
        }
    };
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
    fn the_release_endpoint_matches_tauri_conf() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(
            conf["plugins"]["updater"]["endpoints"],
            serde_json::json!([RELEASE_ENDPOINT])
        );
    }

    #[test]
    fn updater_errors_are_classified() {
        use tauri_plugin_updater::Error;
        assert_eq!(classify(&Error::ReleaseNotFound), Failure::NeedsProbe);
        let bad_json = serde_json::from_str::<serde_json::Value>("{").unwrap_err();
        assert_eq!(
            classify(&Error::Serialization(bad_json)),
            Failure::Known(CheckErrorKind::Other)
        );
        assert_eq!(
            classify(&Error::TargetNotFound("windows-x86_64".into())),
            Failure::Known(CheckErrorKind::Other)
        );
        assert_eq!(
            classify(&Error::SignatureUtf8("x".into())),
            Failure::Known(CheckErrorKind::Other)
        );
    }

    #[test]
    fn only_404_and_410_mean_not_published() {
        use reqwest::StatusCode;
        assert_eq!(probe_status(StatusCode::NOT_FOUND), Probe::NotPublished);
        assert_eq!(probe_status(StatusCode::GONE), Probe::NotPublished);
        for status in [
            StatusCode::INTERNAL_SERVER_ERROR,
            StatusCode::BAD_GATEWAY,
            StatusCode::FORBIDDEN,
            StatusCode::OK,
        ] {
            assert_eq!(probe_status(status), Probe::Failed(CheckErrorKind::Other));
        }
    }

    /// A local server that answers every request with `status`.
    async fn serve(status: u16) -> Url {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let app = axum::Router::new()
            .fallback(move || async move { axum::http::StatusCode::from_u16(status).unwrap() });
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Url::parse(&format!("http://127.0.0.1:{port}/latest.json")).unwrap()
    }

    #[tokio::test]
    async fn probing_a_missing_manifest_says_not_published() {
        assert_eq!(probe(&serve(404).await).await, Probe::NotPublished);
    }

    #[tokio::test]
    async fn probing_a_server_error_is_not_a_network_error() {
        assert_eq!(
            probe(&serve(503).await).await,
            Probe::Failed(CheckErrorKind::Other)
        );
    }

    #[tokio::test]
    async fn a_refused_connection_is_a_network_error() {
        // Bind and drop to get a port nothing listens on.
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let url = Url::parse(&format!("http://127.0.0.1:{port}/latest.json")).unwrap();
        assert_eq!(probe(&url).await, Probe::Failed(CheckErrorKind::Network));
    }

    #[tokio::test]
    async fn an_unknown_host_is_a_network_error() {
        let url = Url::parse("https://glint-update-check.invalid/latest.json").unwrap();
        assert_eq!(probe(&url).await, Probe::Failed(CheckErrorKind::Network));
    }

    #[test]
    fn check_errors_carry_a_kind_for_the_ui() {
        let err = CheckError {
            kind: CheckErrorKind::Network,
            message: "dns error".into(),
        };
        assert_eq!(
            serde_json::to_value(err).unwrap(),
            serde_json::json!({ "kind": "network", "message": "dns error" })
        );
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
