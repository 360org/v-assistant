//! V Assistant desktop shell.
//!
//! The window hosts the React UI; the `runtime` module is the AI Runtime
//! Service boundary: it speaks the NanoClaw engine's channel contract
//! (SQLite inbound/outbound queues, per-agent groups, skills, connector
//! channels) so the UI never deals with engines, containers or config
//! files.

pub mod auth;
pub mod runtime;
#[cfg(feature = "sandbox")]
pub mod sandbox;
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
fn runtime_start_engine(app: tauri::AppHandle, state: tauri::State<Runtime>) -> Result<bool, String> {
    state.spawn_engine(Some(&app))
}

/// Restart the agent runner with a new agent and provider configuration.
#[tauri::command]
fn runtime_restart_runner(
    state: tauri::State<Runtime>,
    agent_name: String,
    base_url: Option<String>,
    model: Option<String>,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    state.spawn_engine_with_config(
        &agent_name,
        base_url.as_deref(),
        model.as_deref(),
        Some(&app),
    )
}

/// Execute a credentialed connector call without exposing the gateway
/// capability or resolved Vault values to Webview/agent code.
#[tauri::command]
fn runtime_connector_request(
    state: tauri::State<Runtime>,
    payload: String,
) -> Result<String, String> {
    state.connector_request(&payload)
}

#[tauri::command]
fn pick_directory() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Chọn thư mục lưu trữ dữ liệu V Assistant")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_custom_data_file(custom_dir: String, subfolder: String, filename: String, content_b64: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;
    use base64::Engine;

    let mut path = PathBuf::from(&custom_dir);
    if custom_dir.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            path = PathBuf::from(home).join(custom_dir.trim_start_matches("~/"));
        }
    }

    let target_dir = path.join(&subfolder);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let file_path = target_dir.join(&filename);
    
    // Strip data URL header if present (e.g. data:image/png;base64,...)
    let clean_b64 = if let Some(pos) = content_b64.find(";base64,") {
        &content_b64[pos + 8..]
    } else {
        &content_b64
    };

    let bytes = if let Ok(data) = base64::engine::general_purpose::STANDARD.decode(clean_b64.as_bytes()) {
        data
    } else {
        content_b64.into_bytes()
    };

    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_custom_data_text(custom_dir: String, relative_path: String, content: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    let mut path = PathBuf::from(&custom_dir);
    if custom_dir.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            path = PathBuf::from(home).join(custom_dir.trim_start_matches("~/"));
        }
    }

    let target_file = path.join(&relative_path);
    if let Some(parent) = target_file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&target_file, content).map_err(|e| e.to_string())?;

    Ok(target_file.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, Submenu, PredefinedMenuItem};
                let edit_menu = Submenu::new(app, "Edit", true)?;
                edit_menu.append_items(&[
                    &PredefinedMenuItem::undo(app, Some("Undo"))?,
                    &PredefinedMenuItem::redo(app, Some("Redo"))?,
                    &PredefinedMenuItem::cut(app, Some("Cut"))?,
                    &PredefinedMenuItem::copy(app, Some("Copy"))?,
                    &PredefinedMenuItem::paste(app, Some("Paste"))?,
                    &PredefinedMenuItem::select_all(app, Some("Select All"))?,
                ])?;
                let menu = Menu::new(app)?;
                menu.append(&edit_menu)?;
                app.set_menu(menu)?;
            }

            let dir = app.path().app_data_dir()?.join("runtime");
            
            // Only development resolves the project from the current checkout.
            // A packaged app must use Tauri's resource directory, where the
            // bundled agent-runner and AI Router sidecar live.
            #[cfg(debug_assertions)]
            if std::env::var("VUA_PROJECT_DIR").is_err() {
                if let Ok(cwd) = std::env::current_dir() {
                    std::env::set_var("VUA_PROJECT_DIR", cwd);
                }
            }

            let project_dir = std::env::var("VUA_PROJECT_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(runtime::resolve_project_dir(app.path().resource_dir()?));
            vault::migrate_legacy_vault(&dir).map_err(std::io::Error::other)?;
            let broker = vault::start_broker(dir.clone()).map_err(std::io::Error::other)?;
            let runtime = Runtime::new(dir, project_dir, broker).map_err(std::io::Error::other)?;
            // Attach a NanoClaw engine when one is installed; otherwise the
            // UI silently falls back to the preview engine.
            let _ = runtime.spawn_engine(Some(app.app_handle()));
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
            runtime_restart_runner,
            runtime_connector_request,
            auth::oauth_listen,
            auth::open_external,
            auth::capture_grok_sso_cookie,
            vault::vault_set,
            vault::vault_get,
            vault::vault_delete,
            pick_directory,
            save_custom_data_file,
            save_custom_data_text
        ])
        .build(tauri::generate_context!())
        .expect("error while building V Assistant")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(runtime) = app_handle.try_state::<Runtime>() {
                    runtime.stop_engine();
                }
            }
        });
}
