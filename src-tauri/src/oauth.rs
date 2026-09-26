//! One-shot loopback listener for the OAuth redirect on desktop.
//!
//! RFC 8252 §7.3: a native app receives the authorisation redirect on
//! http://127.0.0.1 with an ephemeral port. Google permits this for installed
//! apps specifically so that no custom URI scheme has to be registered with
//! the OS.
//!
//! Written against std alone rather than pulling in an HTTP crate — it has to
//! serve exactly one GET and then stop, and a dependency-free version is one
//! less thing to break the Android build, where none of this is compiled.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Holds the bound listener between oauth_start and oauth_await.
#[derive(Default)]
pub struct OauthState(pub Mutex<Option<TcpListener>>);

const DONE_PAGE: &str = "<!doctype html><html><head><meta charset=\"utf-8\">\
<title>MSec</title><style>body{font-family:system-ui,sans-serif;background:#0F1115;\
color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;\
margin:0}div{text-align:center}h1{color:#818cf8;font-size:1.25rem;margin:0 0 .5rem}\
p{color:#94a3b8;font-size:.875rem;margin:0}</style></head><body><div>\
<h1>Signed in to MSec</h1><p>You can close this tab and return to the app.</p>\
</div></body></html>";

/// Bind an ephemeral loopback port and hand the number back so the caller can
/// build a redirect_uri. The listener stays bound until awaited or cancelled,
/// so the port cannot be taken by something else in between.
#[tauri::command]
pub fn oauth_start(state: tauri::State<'_, OauthState>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|_| "listener lock poisoned")? = Some(listener);
    Ok(port)
}

/// Drop the listener without waiting — used when opening the browser failed.
#[tauri::command]
pub fn oauth_cancel(state: tauri::State<'_, OauthState>) -> Result<(), String> {
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
    Ok(())
}

/// Wait for the browser to arrive, then return the request's query string.
///
/// Runs on the blocking pool: accept() would otherwise stall Tauri's async
/// runtime for as long as the user takes to approve the consent screen.
#[tauri::command]
pub async fn oauth_await(
    state: tauri::State<'_, OauthState>,
    timeout_secs: u64,
) -> Result<String, String> {
    let listener = state
        .0
        .lock()
        .map_err(|_| "listener lock poisoned")?
        .take()
        .ok_or("Sign-in was not started.")?;

    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + Duration::from_secs(timeout_secs);

        loop {
            if Instant::now() >= deadline {
                return Err("Sign-in timed out.".to_string());
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_nonblocking(false).ok();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .ok();

                    // Only the request line matters: "GET /?code=...&state=... HTTP/1.1"
                    let mut line = String::new();
                    BufReader::new(&stream)
                        .read_line(&mut line)
                        .map_err(|e| e.to_string())?;

                    let target = line.split_whitespace().nth(1).unwrap_or("");
                    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("").to_string();

                    // Answer before returning, or the browser shows a connection
                    // error on what was actually a successful sign-in.
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
                         Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                        DONE_PAGE.len(),
                        DONE_PAGE
                    );
                    stream.write_all(response.as_bytes()).ok();
                    stream.flush().ok();

                    if query.is_empty() {
                        // Browsers speculatively fetch /favicon.ico against the
                        // same origin; that is not the redirect, so keep waiting.
                        continue;
                    }
                    return Ok(query);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(200));
                }
                Err(e) => return Err(e.to_string()),
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
