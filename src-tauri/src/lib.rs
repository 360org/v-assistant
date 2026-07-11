//! V Assistant desktop shell.
//!
//! The window hosts the React UI; the `runtime` module is the AI Runtime
//! Service boundary: it speaks the NanoClaw engine's channel contract
//! (SQLite inbound/outbound queues, per-agent groups, skills, connector
//! channels) so the UI never deals with engines, containers or config
//! files.

pub mod auth;
pub mod runtime;
pub mod vault;

use runtime::{AgentConfig, OutboundMessage, Runtime, RuntimeStatus};
use tauri::Manager;

#[tauri::command]
fn runtime_status(state: tauri::State<Runtime>) -> RuntimeStatus {
    state.status()
}

/// Queue a user message for the engine; returns the inbound message id.
#[tauri::command]
fn runtime_send(
    state: tauri::State<Runtime>,
    group_id: String,
    content: String,
    meta: String,
) -> Result<i64, String> {
    state.send(&group_id, &content, &meta)
}

/// Poll engine replies for a group newer than `after_id`.
#[tauri::command]
fn runtime_receive(
    state: tauri::State<Runtime>,
    group_id: String,
    after_id: i64,
) -> Result<Vec<OutboundMessage>, String> {
    state.receive(&group_id, after_id)
}

/// Materialize installed agents (and the skills library) for the engine.
#[tauri::command]
fn runtime_sync(state: tauri::State<Runtime>, agents: Vec<AgentConfig>) -> Result<(), String> {
    state.sync(&agents, None)
}

/// Try to attach the engine; false means no engine is installed and the
/// app stays on the built-in preview engine.
#[tauri::command]
fn runtime_start_engine(state: tauri::State<Runtime>) -> Result<bool, String> {
    state.spawn_engine()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?.join("runtime");
            let runtime = Runtime::new(dir).map_err(std::io::Error::other)?;
            // Attach a NanoClaw engine when one is installed; otherwise the
            // UI silently falls back to the preview engine.
            let _ = runtime.spawn_engine();
            app.manage(runtime);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(runtime) = window.app_handle().try_state::<Runtime>() {
                    runtime.stop_engine();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            runtime_send,
            runtime_receive,
            runtime_sync,
            runtime_start_engine,
            auth::oauth_listen,
            auth::open_external,
            vault::vault_set,
            vault::vault_get,
            vault::vault_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running V Assistant");
}
