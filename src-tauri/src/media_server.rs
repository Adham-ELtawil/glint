use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};

use axum::Router;
use axum::body::Body;
use axum::extract::{Path as AxumPath, State};
use axum::http::{HeaderValue, Method, Request, StatusCode, header};
use axum::response::Response;
use axum::routing::any;
use bytes::Bytes;
use http_body::Frame;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeekExt, ReadBuf};

use crate::ffmpeg::args::{session_args, video_encoder};
use crate::ffmpeg::plan::Plan;
use crate::ffmpeg::process;
use crate::range::parse_byte_range;

/// Loopback file server so `<video>` can seek with HTTP range requests.
///
/// WebView2 (Windows) and WebKitGTK (Linux) both play HTML5 media reliably
/// from `http://127.0.0.1`, including large files. Tauri's asset protocol does
/// not. Tokens are unguessable and only files the user opened are registered.
#[derive(Clone)]
pub struct MediaServer {
    port: u16,
    shared: Shared,
}

/// A file that plays through ffmpeg, and the plan it plays with.
#[derive(Clone)]
struct StreamEntry {
    path: PathBuf,
    plan: Plan,
    /// Bumped by every new request, so a superseded session stops streaming.
    session: Arc<AtomicU64>,
}

#[derive(Clone)]
struct Shared {
    files: Arc<Mutex<HashMap<String, PathBuf>>>,
    streams: Arc<Mutex<HashMap<String, StreamEntry>>>,
    ffmpeg: Option<PathBuf>,
}

impl MediaServer {
    pub fn start() -> Result<Self, String> {
        Self::start_with(None)
    }

    /// `ffmpeg` enables the `/stream` route for files the webview can't play.
    pub fn start_with(ffmpeg: Option<PathBuf>) -> Result<Self, String> {
        let shared = Shared {
            files: Arc::new(Mutex::new(HashMap::new())),
            streams: Arc::new(Mutex::new(HashMap::new())),
            ffmpeg,
        };
        let app = Router::new()
            .route("/media/{token}", any(serve))
            .route("/stream/{token}", any(stream))
            .with_state(shared.clone());

        let std_listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|err| format!("Couldn't start playback server: {err}"))?;
        std_listener
            .set_nonblocking(true)
            .map_err(|err| format!("Couldn't start playback server: {err}"))?;
        let port = std_listener
            .local_addr()
            .map_err(|err| format!("Couldn't start playback server: {err}"))?
            .port();

        std::thread::Builder::new()
            .name("glint-media".into())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("media runtime");
                runtime.block_on(async move {
                    let listener =
                        tokio::net::TcpListener::from_std(std_listener).expect("media listener");
                    if let Err(err) = axum::serve(listener, app).await {
                        eprintln!("media server stopped: {err}");
                    }
                });
            })
            .map_err(|err| format!("Couldn't start playback server: {err}"))?;

        Ok(Self { port, shared })
    }

    pub fn register(&self, path: &Path) -> Result<String, String> {
        let canon = path
            .canonicalize()
            .map_err(|_| "Couldn't read that file.".to_string())?;
        if !canon.is_file() {
            return Err("Choose a video file.".into());
        }
        let mut files = self.shared.files.lock().expect("media registry");
        if let Some((token, _)) = files.iter().find(|(_, stored)| *stored == &canon) {
            let token = token.clone();
            return Ok(self.url(&token));
        }
        let token = uuid::Uuid::new_v4().simple().to_string();
        files.insert(token.clone(), canon);
        Ok(self.url(&token))
    }

    fn url(&self, token: &str) -> String {
        format!("http://127.0.0.1:{}/media/{token}", self.port)
    }

    /// A loopback URL that streams `path` through ffmpeg as fragmented MP4.
    /// The player appends `?t=<seconds>` to start anywhere in the file.
    pub fn register_stream(&self, path: &Path, plan: Plan) -> Result<String, String> {
        if self.shared.ffmpeg.is_none() {
            return Err("Glint's FFmpeg is missing. Reinstall Glint to play this file.".into());
        }
        let canon = path
            .canonicalize()
            .map_err(|_| "Couldn't read that file.".to_string())?;
        let mut streams = self.shared.streams.lock().expect("stream registry");
        if let Some((token, _)) = streams
            .iter()
            .find(|(_, entry)| entry.path == canon && entry.plan == plan)
        {
            return Ok(self.stream_url(token));
        }
        let token = uuid::Uuid::new_v4().simple().to_string();
        streams.insert(
            token.clone(),
            StreamEntry {
                path: canon,
                plan,
                session: Arc::new(AtomicU64::new(0)),
            },
        );
        Ok(self.stream_url(&token))
    }

    fn stream_url(&self, token: &str) -> String {
        format!("http://127.0.0.1:{}/stream/{token}", self.port)
    }
}

/// ffmpeg's stdout as a response body. Dropping it (client gone, aborted
/// fetch, superseded session) drops the child, which kills ffmpeg.
struct StreamBody {
    _child: tokio::process::Child,
    stdout: tokio::process::ChildStdout,
    session: Arc<AtomicU64>,
    id: u64,
}

impl http_body::Body for StreamBody {
    type Data = Bytes;
    type Error = std::io::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        let this = self.get_mut();
        if this.session.load(Ordering::SeqCst) != this.id {
            return Poll::Ready(None);
        }
        let mut buf = vec![0_u8; 128 * 1024];
        let mut read = ReadBuf::new(&mut buf);
        match Pin::new(&mut this.stdout).poll_read(cx, &mut read) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Err(err)) => Poll::Ready(Some(Err(err))),
            Poll::Ready(Ok(())) => {
                let n = read.filled().len();
                if n == 0 {
                    return Poll::Ready(None);
                }
                Poll::Ready(Some(Ok(Frame::data(Bytes::copy_from_slice(read.filled())))))
            }
        }
    }
}

/// Seconds from `?t=`; anything missing or invalid starts at 0.
fn start_from_query(query: Option<&str>) -> f64 {
    query
        .unwrap_or("")
        .split('&')
        .find_map(|pair| pair.strip_prefix("t="))
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|t| t.is_finite() && *t > 0.0)
        .unwrap_or(0.0)
}

async fn stream(
    State(shared): State<Shared>,
    AxumPath(token): AxumPath<String>,
    method: Method,
    request: Request<Body>,
) -> Response {
    if method == Method::OPTIONS {
        return empty(StatusCode::NO_CONTENT);
    }
    if method != Method::GET {
        return text(StatusCode::METHOD_NOT_ALLOWED, "method not allowed");
    }
    let entry = {
        let streams = shared.streams.lock().expect("stream registry");
        streams.get(&token).cloned()
    };
    let (Some(entry), Some(ffmpeg)) = (entry, shared.ffmpeg.clone()) else {
        return text(StatusCode::NOT_FOUND, "not found");
    };
    let start = start_from_query(request.uri().query());
    let id = entry.session.fetch_add(1, Ordering::SeqCst) + 1;

    let args = session_args(&entry.path, &entry.plan, start, &video_encoder());
    let mut child = match process::tokio_command(&ffmpeg)
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            eprintln!("couldn't start ffmpeg: {err}");
            return text(StatusCode::INTERNAL_SERVER_ERROR, "couldn't start ffmpeg");
        }
    };
    process::adopt(&child);
    let Some(stdout) = child.stdout.take() else {
        return text(StatusCode::INTERNAL_SERVER_ERROR, "couldn't start ffmpeg");
    };
    if let Some(mut stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut log = Vec::new();
            let _ = (&mut stderr).take(16 * 1024).read_to_end(&mut log).await;
            if !log.is_empty() {
                eprintln!("ffmpeg: {}", String::from_utf8_lossy(&log).trim());
            }
        });
    }
    let body = StreamBody {
        _child: child,
        stdout,
        session: entry.session.clone(),
        id,
    };
    match Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::new(body))
    {
        Ok(response) => with_cors(response),
        Err(_) => text(StatusCode::INTERNAL_SERVER_ERROR, "couldn't start ffmpeg"),
    }
}

/// Streaming body with an exact size hint so hyper sends `Content-Length`
/// instead of chunked encoding. Media elements seek poorly against chunked 206s.
struct FileBody {
    file: tokio::io::Take<tokio::fs::File>,
    remaining: u64,
}

impl FileBody {
    async fn open(path: &Path, start: u64, length: u64) -> std::io::Result<Self> {
        let mut file = tokio::fs::File::open(path).await?;
        if start > 0 {
            file.seek(std::io::SeekFrom::Start(start)).await?;
        }
        Ok(Self {
            file: file.take(length),
            remaining: length,
        })
    }
}

impl http_body::Body for FileBody {
    type Data = Bytes;
    type Error = std::io::Error;

    fn size_hint(&self) -> http_body::SizeHint {
        http_body::SizeHint::with_exact(self.remaining)
    }

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        let this = self.get_mut();
        if this.remaining == 0 {
            return Poll::Ready(None);
        }
        let cap = (64 * 1024).min(usize::try_from(this.remaining).unwrap_or(64 * 1024));
        let mut buf = vec![0_u8; cap.max(1)];
        let mut read = ReadBuf::new(&mut buf);
        match Pin::new(&mut this.file).poll_read(cx, &mut read) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Err(err)) => Poll::Ready(Some(Err(err))),
            Poll::Ready(Ok(())) => {
                let n = read.filled().len();
                if n == 0 {
                    this.remaining = 0;
                    return Poll::Ready(None);
                }
                let data = Bytes::copy_from_slice(read.filled());
                this.remaining = this.remaining.saturating_sub(n as u64);
                Poll::Ready(Some(Ok(Frame::data(data))))
            }
        }
    }
}

async fn serve(
    State(shared): State<Shared>,
    AxumPath(token): AxumPath<String>,
    method: Method,
    request: Request<Body>,
) -> Response {
    if method == Method::OPTIONS {
        return empty(StatusCode::NO_CONTENT);
    }
    if method != Method::GET && method != Method::HEAD {
        return text(StatusCode::METHOD_NOT_ALLOWED, "method not allowed");
    }
    let path = {
        let files = shared.files.lock().expect("media registry");
        files.get(&token).cloned()
    };
    let Some(path) = path else {
        return text(StatusCode::NOT_FOUND, "not found");
    };

    let size = match tokio::fs::metadata(&path).await {
        Ok(meta) => meta.len(),
        Err(_) => return text(StatusCode::NOT_FOUND, "not found"),
    };

    let (status, start, length) = match request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
    {
        Some(value) => match parse_byte_range(value, size) {
            Ok(range) => (StatusCode::PARTIAL_CONTENT, range.start, range.length()),
            Err(()) => return unsatisfiable(size),
        },
        None => (StatusCode::OK, 0, size),
    };

    let body = if method == Method::HEAD {
        Body::empty()
    } else {
        match FileBody::open(&path, start, length).await {
            Ok(file) => Body::new(file),
            Err(_) => return text(StatusCode::INTERNAL_SERVER_ERROR, "couldn't read that file"),
        }
    };

    let mut response = Response::builder()
        .status(status)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_TYPE, mime_for(&path))
        .header(header::CONTENT_LENGTH, length.to_string());
    if status == StatusCode::PARTIAL_CONTENT {
        let end = start.saturating_add(length).saturating_sub(1);
        response = response.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"));
    }
    match response.body(body) {
        Ok(response) => with_cors(response),
        Err(_) => text(StatusCode::INTERNAL_SERVER_ERROR, "couldn't read that file"),
    }
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mov" => "video/quicktime",
        "ogv" | "ogg" => "video/ogg",
        "avi" => "video/x-msvideo",
        "mpeg" | "mpg" => "video/mpeg",
        "webvtt" | "vtt" => "text/vtt",
        _ => "application/octet-stream",
    }
}

fn apply_cors(headers: &mut axum::http::HeaderMap) {
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Length, Content-Range, Accept-Ranges, Content-Type"),
    );
}

fn empty(status: StatusCode) -> Response {
    with_cors(
        Response::builder()
            .status(status)
            .body(Body::empty())
            .unwrap(),
    )
}

fn text(status: StatusCode, body: &'static str) -> Response {
    with_cors(
        Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(body))
            .unwrap(),
    )
}

fn unsatisfiable(size: u64) -> Response {
    with_cors(
        Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{size}"))
            .header(header::ACCEPT_RANGES, "bytes")
            .body(Body::empty())
            .unwrap(),
    )
}

fn with_cors(mut response: Response) -> Response {
    apply_cors(response.headers_mut());
    if !response
        .headers()
        .contains_key(header::ACCESS_CONTROL_ALLOW_METHODS)
    {
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, HEAD, OPTIONS"),
        );
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("Range"),
        );
    }
    response
}

#[cfg(test)]
mod tests {
    use super::MediaServer;
    use std::io::{Read, Write};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn serves_a_byte_range() {
        let server = MediaServer::start().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "glint-media-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("clip.mp4");
        std::fs::write(&file, b"0123456789abcdef").unwrap();
        let url = server.register(&file).unwrap();
        let again = server.register(&file).unwrap();
        assert_eq!(url, again);

        let (status, headers, body) = http(&url, Some("bytes=4-9"));
        assert_eq!(status, 206, "{headers}");
        assert_eq!(body, b"456789");
        let headers_lower = headers.to_ascii_lowercase();
        assert!(
            headers_lower.contains("content-range: bytes 4-9/16"),
            "{headers}"
        );
        assert!(
            headers_lower.contains("content-type: video/mp4"),
            "{headers}"
        );
        assert!(
            headers_lower.contains("access-control-allow-origin: *"),
            "{headers}"
        );
        assert!(headers_lower.contains("content-length: 6"), "{headers}");
        assert!(
            !headers_lower.contains("transfer-encoding: chunked"),
            "{headers}"
        );

        let (full_status, full_headers, full_body) = http(&url, None);
        assert_eq!(full_status, 200);
        assert_eq!(full_body, b"0123456789abcdef");
        assert!(
            full_headers
                .to_ascii_lowercase()
                .contains("content-length: 16"),
            "{full_headers}"
        );

        let (bad_status, bad_headers, _) = http(&url, Some("bytes=40-50"));
        assert_eq!(bad_status, 416, "{bad_headers}");
        assert!(
            bad_headers
                .to_ascii_lowercase()
                .contains("content-range: bytes */16"),
            "{bad_headers}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_the_start_time() {
        assert_eq!(super::start_from_query(None), 0.0);
        assert_eq!(super::start_from_query(Some("t=12.5")), 12.5);
        assert_eq!(super::start_from_query(Some("x=1&t=3")), 3.0);
        assert_eq!(super::start_from_query(Some("t=-4")), 0.0);
        assert_eq!(super::start_from_query(Some("t=NaN")), 0.0);
    }

    #[test]
    fn stream_route_needs_ffmpeg() {
        let server = MediaServer::start().unwrap();
        let file = std::env::temp_dir().join("glint-no-ffmpeg.mkv");
        std::fs::write(&file, b"x").unwrap();
        let plan = crate::ffmpeg::plan::Plan {
            mode: crate::ffmpeg::plan::Mode::Remux,
            video: crate::ffmpeg::plan::VideoAction::None,
            audio: None,
        };
        assert!(server.register_stream(&file, plan).is_err());
        let _ = std::fs::remove_file(&file);
    }

    /// End to end with a real ffmpeg and media file. Runs only when
    /// GLINT_FFMPEG_DIR and GLINT_TEST_MEDIA are set (an MKV with AC3/TrueHD
    /// audio works well).
    #[test]
    fn streams_fragmented_mp4_from_any_time() {
        let (Some(ffmpeg), Ok(media)) = (
            crate::ffmpeg::tool_path("ffmpeg"),
            std::env::var("GLINT_TEST_MEDIA"),
        ) else {
            return;
        };
        let ffprobe = crate::ffmpeg::tool_path("ffprobe").unwrap();
        let path = std::path::PathBuf::from(media);
        let probe = crate::ffmpeg::probe::run(&ffprobe, &path).unwrap();
        let plan = crate::ffmpeg::plan::plan(&probe, true);
        let server = MediaServer::start_with(Some(ffmpeg)).unwrap();
        let url = server.register_stream(&path, plan).unwrap();
        for start in [0.0_f64, 8.0] {
            let (status, headers, body) = http(&format!("{url}?t={start}"), None);
            assert_eq!(status, 200, "{headers}");
            assert_eq!(&body[4..8], b"ftyp");
            assert!(body.windows(4).any(|w| w == b"moov"));
            let first = first_tfdt_seconds(&body).expect("a fragment");
            let expected = probe.start_time + start + crate::ffmpeg::args::TIMESTAMP_PAD;
            // Copied video starts at the keyframe at or before the seek point.
            assert!(first <= expected + 0.1, "{first} vs {expected}");
            assert!(first >= expected - 10.0, "{first} vs {expected}");
        }
    }

    /// First video `tfdt` in seconds, using the first track's `mdhd` timescale.
    fn first_tfdt_seconds(data: &[u8]) -> Option<f64> {
        let find = |name: &[u8], from: usize| {
            data[from..]
                .windows(4)
                .position(|w| w == name)
                .map(|p| p + from)
        };
        let mdhd = find(b"mdhd", 0)?;
        let version = data[mdhd + 4];
        let scale_at = if version == 1 { mdhd + 24 } else { mdhd + 16 };
        let scale = u32::from_be_bytes(data[scale_at..scale_at + 4].try_into().ok()?) as f64;
        let moof = find(b"moof", 0)?;
        let tfdt = find(b"tfdt", moof)?;
        let value = if data[tfdt + 4] == 1 {
            u64::from_be_bytes(data[tfdt + 8..tfdt + 16].try_into().ok()?) as f64
        } else {
            u32::from_be_bytes(data[tfdt + 8..tfdt + 12].try_into().ok()?) as f64
        };
        Some(value / scale)
    }

    fn http(url: &str, range: Option<&str>) -> (u16, String, Vec<u8>) {
        let rest = url.trim_start_matches("http://");
        let (addr, path) = rest.split_once('/').unwrap();
        let mut stream = std::net::TcpStream::connect(addr).unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(3)))
            .unwrap();
        let range_line = range
            .map(|value| format!("Range: {value}\r\n"))
            .unwrap_or_default();
        let request = format!(
            "GET /{path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n{range_line}\r\n"
        );
        stream.write_all(request.as_bytes()).unwrap();
        let mut bytes = Vec::new();
        stream.read_to_end(&mut bytes).unwrap();
        let text_end = bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .unwrap();
        let header_text = String::from_utf8_lossy(&bytes[..text_end]).to_string();
        let status: u16 = header_text
            .split_whitespace()
            .nth(1)
            .unwrap()
            .parse()
            .unwrap();
        let mut body = bytes[text_end + 4..].to_vec();
        if header_text
            .to_ascii_lowercase()
            .contains("transfer-encoding: chunked")
        {
            body = decode_chunked(&body);
        }
        (status, header_text, body)
    }

    fn decode_chunked(input: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut rest = input;
        while let Some(line_end) = rest.windows(2).position(|window| window == b"\r\n") {
            let line = std::str::from_utf8(&rest[..line_end]).unwrap_or("");
            let size = usize::from_str_radix(line.split(';').next().unwrap_or("0").trim(), 16)
                .unwrap_or(0);
            rest = &rest[line_end + 2..];
            if size == 0 || rest.len() < size {
                break;
            }
            out.extend_from_slice(&rest[..size]);
            rest = &rest[size..];
            if rest.starts_with(b"\r\n") {
                rest = &rest[2..];
            }
        }
        out
    }
}
