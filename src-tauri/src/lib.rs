//! V Assistant desktop shell.
//!
//! The window hosts the React UI; this crate is the "AI Runtime Service"
//! boundary. Provider connections, agent execution and knowledge indexing
//! run behind the commands exposed here so the UI never deals with engines,
//! containers or config files.

use serde::Serialize;

#[derive(Serialize)]
pub struct RuntimeStatus {
    pub version: &'static str,
    pub ready: bool,
}

/// Reports whether the background AI runtime is up. The demo runtime is
/// always ready; a real engine reports its actual boot state here.
#[tauri::command]
fn runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        version: env!("CARGO_PKG_VERSION"),
        ready: true,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_status])
        .run(tauri::generate_context!())
        .expect("error while running V Assistant");
}
