//! Desktop OAuth via loopback redirect.
//!
//! The webview can't complete a provider OAuth by itself (the vendor won't
//! render inside an embedded view, and there's no public callback URL). The
//! standard native pattern instead:
//!
//!   1. app opens a throwaway `http://127.0.0.1:<port>` listener,
//!   2. app opens the vendor's login in the user's real browser, passing
//!      that loopback as the callback URL,
//!   3. the browser redirects back to the loopback with `?code=…`,
//!   4. the app reads the code and finishes the token exchange.
//!
//! Only the listen + browser-open steps are native; the PKCE challenge and
//! the code→key exchange stay in the frontend so all providers share one
//! path. The obtained key is then stored in the credential Vault.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use tauri::{AppHandle, Emitter};

/// Landing page shown in the browser after the redirect.
const DONE_PAGE: &str = "<!doctype html><html><head><meta charset=\"utf-8\">\
<title>V Assistant</title></head>\
<body style=\"font-family:system-ui;background:#0a0a0a;color:#eaeaea;\
text-align:center;padding-top:22vh\">\
<h2>V Assistant</h2><p>Signed in successfully. You can close this tab and \
return to the app.</p></body></html>";

/// Start the loopback listener and return its port. Accepts exactly one
/// redirect, emits `oauth-code` (or `oauth-error`) to the frontend, and
/// exits.
#[tauri::command]
pub fn oauth_listen(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    std::thread::spawn(move || {
        if let Ok((stream, _)) = listener.accept() {
            match handle_connection(stream) {
                Some(code) => {
                    let _ = app.emit("oauth-code", code);
                }
                None => {
                    let _ = app.emit(
                        "oauth-error",
                        "no authorization code in callback".to_string(),
                    );
                }
            }
        }
    });
    Ok(port)
}

/// Read one HTTP request, reply with the landing page, and return the
/// `code` query parameter. Kept Tauri-free so it is unit-testable.
pub fn handle_connection(mut stream: TcpStream) -> Option<String> {
    let request_line = {
        let mut reader = BufReader::new(&stream);
        let mut line = String::new();
        reader.read_line(&mut line).ok()?;
        line
    };
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        DONE_PAGE.len(),
        DONE_PAGE,
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
    query_param(&request_line, "code")
}

/// Pull a query parameter out of an HTTP request line such as
/// `GET /callback?code=abc&state=xyz HTTP/1.1`.
pub fn query_param(request_line: &str, key: &str) -> Option<String> {
    let path = request_line.split_whitespace().nth(1)?;
    let query = path.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

/// Minimal percent-decoding for query values (`%XX` and `+` → space).
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                if let (Some(hi), Some(lo)) = (hi, lo) {
                    out.push((hi * 16 + lo) as u8);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Open a URL in the user's default browser (for the login redirect).
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    open_url(&url).map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("xdg-open").arg(url).spawn().map(|_| ())
}
#[cfg(target_os = "macos")]
fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("open").arg(url).spawn().map(|_| ())
}
#[cfg(target_os = "windows")]
fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map(|_| ())
}
