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

fn resolve_data_dir(custom_dir: &str) -> std::path::PathBuf {
    use std::path::PathBuf;
    let trimmed = custom_dir.trim();
    if trimmed.is_empty() || trimmed == "~/.v-assistant/data" {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(".v-assistant/data");
        }
    }
    if trimmed.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(trimmed.trim_start_matches("~/"));
        }
    }
    PathBuf::from(trimmed)
}

#[tauri::command]
fn resolve_data_dir_path(custom_dir: String) -> String {
    resolve_data_dir(&custom_dir).to_string_lossy().to_string()
}

#[tauri::command]
fn save_custom_data_file(custom_dir: String, subfolder: String, filename: String, content_b64: String) -> Result<String, String> {
    use std::fs;
    use base64::Engine;

    let path = resolve_data_dir(&custom_dir);
    let target_dir = path.join(&subfolder);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    // Anti-collision: macOS clipboard pastes default to "image.png"
    let mut file_path = target_dir.join(&filename);
    if file_path.exists() {
        let stem = file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = file_path.extension().and_then(|s| s.to_str()).unwrap_or("");
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let new_filename = if ext.is_empty() {
            format!("{}_{}", stem, now_ms)
        } else {
            format!("{}_{}.{}", stem, now_ms, ext)
        };
        file_path = target_dir.join(new_filename);
    }

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

    let path = resolve_data_dir(&custom_dir);
    let target_file = path.join(&relative_path);
    if let Some(parent) = target_file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&target_file, content).map_err(|e| e.to_string())?;

    Ok(target_file.to_string_lossy().to_string())
}

#[tauri::command]
fn read_host_file(path: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    let mut file_path = PathBuf::from(&path);
    if path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            file_path = PathBuf::from(home).join(path.trim_start_matches("~/"));
        }
    }

    fs::read_to_string(&file_path).map_err(|e| format!("Lỗi đọc file: {}", e))
}

#[tauri::command]
fn write_host_file(path: String, content: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    let mut file_path = PathBuf::from(&path);
    if path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            file_path = PathBuf::from(home).join(path.trim_start_matches("~/"));
        }
    }

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Lỗi tạo thư mục: {}", e))?;
    }

    fs::write(&file_path, content).map_err(|e| format!("Lỗi ghi file: {}", e))?;
    Ok(format!("Ghi file thành công vào: {}", file_path.to_string_lossy()))
}

#[tauri::command]
fn list_host_dir(path: String) -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::PathBuf;

    let mut dir_path = PathBuf::from(&path);
    if path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            dir_path = PathBuf::from(home).join(path.trim_start_matches("~/"));
        }
    }

    let entries = fs::read_dir(&dir_path).map_err(|e| format!("Lỗi đọc thư mục: {}", e))?;
    let mut files = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        files.push(if is_dir { format!("{}/", name) } else { name });
    }
    Ok(files)
}

#[tauri::command]
async fn execute_cli_command(command: String, cwd: Option<String>) -> Result<String, String> {
    use std::process::{Command, Stdio};
    use std::path::PathBuf;
    use std::time::Duration;

    let shell = if cfg!(target_os = "windows") { "cmd" } else { "sh" };
    let shell_arg = if cfg!(target_os = "windows") { "/C" } else { "-c" };

    let mut cmd = Command::new(shell);
    cmd.arg(shell_arg)
        .arg(&command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(ref dir) = cwd {
        if !dir.trim().is_empty() {
            let mut path = PathBuf::from(dir);
            if dir.starts_with("~/") {
                if let Ok(home) = std::env::var("HOME") {
                    path = PathBuf::from(home).join(dir.trim_start_matches("~/"));
                }
            }
            cmd.current_dir(path);
        }
    }

    let mut child = cmd.spawn().map_err(|e| format!("Lỗi khởi tạo lệnh CLI: {}", e))?;

    let timeout = Duration::from_secs(30);
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    let _ = std::io::Read::read_to_end(&mut out, &mut stdout);
                }
                if let Some(mut err_out) = child.stderr.take() {
                    let _ = std::io::Read::read_to_end(&mut err_out, &mut stderr);
                }
                let stdout_str = String::from_utf8_lossy(&stdout).to_string();
                let stderr_str = String::from_utf8_lossy(&stderr).to_string();
                let exit_code = status.code().unwrap_or(-1);
                if exit_code == 0 {
                    if stdout_str.trim().is_empty() && !stderr_str.trim().is_empty() {
                        return Ok(format!("[CLI stdout (rỗng)]\n[stderr]\n{}", stderr_str));
                    } else {
                        return Ok(stdout_str);
                    }
                } else {
                    return Err(format!("Lỗi thực thi lệnh CLI (Mã lỗi {}):\n{}", exit_code, stderr_str));
                }
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    return Err("Lệnh CLI bị hủy do quá thời gian chờ (Timeout 30s).".to_string());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Lỗi khi chờ lệnh CLI: {}", e)),
        }
    }
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
            resolve_data_dir_path,
            save_custom_data_file,
            save_custom_data_text,
            read_host_file,
            write_host_file,
            list_host_dir,
            execute_cli_command
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
