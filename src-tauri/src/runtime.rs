//! AI Runtime Service — the desktop side of the V-Assistant Agent Runner.
//!
//! Handles SQLite IPC layer (inbound.db/outbound.db) matching the new schema:
//!   inbound.db  — UI writes to messages_in; host uses even sequence numbers
//!   outbound.db — Runner writes to messages_out; UI polls this DB
//!
//! Spawns the Universal Agent Runner process, automatically writing runner.json
//! before startup to pass settings.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

/// App-facing engine state, managed by Tauri.
pub struct Runtime {
    pub dir: PathBuf,
    engine: Arc<Mutex<Option<Child>>>,
}

#[derive(Serialize)]
pub struct RuntimeStatus {
    pub version: &'static str,
    /// True when a V-Assistant Agent Runner process is attached and alive.
    pub engine_running: bool,
    /// Where the runtime exchanges messages with the engine.
    pub dir: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct OutboundMessage {
    pub id: i64,
    pub group_id: String,
    pub content: String,
    pub created_at: i64,
}

/// One agent definition.
#[derive(Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub instructions: Option<String>,
    pub soul: Option<String>,
}

fn find_executable(name: &str) -> Option<PathBuf> {
    // Check system PATH env
    if let Ok(path_var) = std::env::var("PATH") {
        for path in std::env::split_paths(&path_var) {
            let p = path.join(name);
            if p.exists() {
                return Some(p);
            }
        }
    }
    
    // Check common installation paths
    let common_paths = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
    ];
    
    for path in &common_paths {
        let p = Path::new(path).join(name);
        if p.exists() {
            return Some(p);
        }
    }
    
    // Check NVM/Node paths
    if let Ok(home) = std::env::var("HOME") {
        let nvm_path = Path::new(&home).join(".nvm/versions/node");
        if nvm_path.exists() {
            if let Ok(entries) = std::fs::read_dir(nvm_path) {
                for entry in entries.flatten() {
                    let bin_path = entry.path().join("bin").join(name);
                    if bin_path.exists() {
                        return Some(bin_path);
                    }
                }
            }
        }
    }
    
    None
}

fn spawn_process(dir: &Path, project_dir: &Path, config_path: &Path) -> Result<Child, String> {
    let runner_src = project_dir.join("agent-runner/src/index.ts");
    let runner_dist = project_dir.join("agent-runner/dist/index.js");

    let npx_bin = find_executable("npx").unwrap_or_else(|| PathBuf::from("npx"));
    let node_bin = find_executable("node").unwrap_or_else(|| PathBuf::from("node"));

    let mut cmd = if runner_src.exists() {
        let mut c = Command::new(&npx_bin);
        c.args(["tsx", runner_src.to_str().unwrap()]);
        c
    } else if runner_dist.exists() {
        let mut c = Command::new(&node_bin);
        c.arg(runner_dist.to_str().unwrap());
        c
    } else {
        return Err("Runner source or dist not found".to_string());
    };

    // Construct a robust PATH env including common local bins
    let mut paths = Vec::new();
    if let Ok(path_var) = std::env::var("PATH") {
        paths.extend(std::env::split_paths(&path_var));
    }
    paths.push(PathBuf::from("/opt/homebrew/bin"));
    paths.push(PathBuf::from("/usr/local/bin"));
    
    if let Ok(home) = std::env::var("HOME") {
        let nvm_path = Path::new(&home).join(".nvm/versions/node");
        if nvm_path.exists() {
            if let Ok(entries) = std::fs::read_dir(nvm_path) {
                for entry in entries.flatten() {
                    paths.push(entry.path().join("bin"));
                }
            }
        }
    }
    let new_path = std::env::join_paths(paths).unwrap_or_default();

    cmd.env("VUA_DATA_DIR", dir)
        .env("VUA_IPC_DIR", dir.join("ipc"))
        .env("CONFIG_PATH", config_path)
        .env("PATH", new_path)
        .stdin(Stdio::null());

    // Redirect stdout/stderr to runner.log for easier diagnostics
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(dir.join("runner.log"));

    if let Ok(file) = log_file {
        if let Ok(stderr_file) = file.try_clone() {
            cmd.stdout(file).stderr(stderr_file);
        } else {
            cmd.stdout(file).stderr(Stdio::null());
        }
    } else {
        cmd.stdout(Stdio::null()).stderr(Stdio::null());
    }

    cmd.spawn().map_err(err)
}

impl Runtime {
    pub fn new(dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(dir.join("ipc")).map_err(err)?;
        std::fs::create_dir_all(dir.join("agents")).map_err(err)?;

        let engine = Arc::new(Mutex::new(None));

        let runtime = Runtime {
            dir: dir.clone(),
            engine: engine.clone(),
        };

        // Initialize schema for both DBs
        runtime.init_inbound_schema()?;
        runtime.init_outbound_schema()?;

        // Spawning background process monitor (health check & auto-restart)
        let dir_clone = dir;
        let engine_clone = engine.clone();
        let project_dir_val = std::env::var("VUA_PROJECT_DIR").ok();

        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(5));
                
                let mut guard = match engine_clone.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                };

                if let Some(child) = guard.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            println!("[tauri-runtime] Agent runner exited unexpectedly with status: {}. Restarting...", status);
                            
                            let config_path = dir_clone.join("runner.json");
                            let project_dir = if let Some(ref p) = project_dir_val {
                                PathBuf::from(p)
                            } else {
                                PathBuf::new()
                            };

                            match spawn_process(&dir_clone, &project_dir, &config_path) {
                                Ok(new_child) => {
                                    *child = new_child;
                                    println!("[tauri-runtime] Agent runner auto-restarted successfully.");
                                }
                                Err(e) => {
                                    println!("[tauri-runtime] Failed to auto-restart agent runner: {}", e);
                                }
                            }
                        }
                        Ok(None) => {}
                        Err(e) => {
                            println!("[tauri-runtime] Error checking agent runner status: {}", e);
                        }
                    }
                }
            }
        });

        Ok(runtime)
    }

    fn inbound(&self) -> PathBuf {
        self.dir.join("ipc/inbound.db")
    }

    fn outbound(&self) -> PathBuf {
        self.dir.join("ipc/outbound.db")
    }

    fn init_inbound_schema(&self) -> Result<(), String> {
        let conn = Connection::open(self.inbound()).map_err(err)?;
        conn.execute_batch(
            "PRAGMA journal_mode = DELETE;
             CREATE TABLE IF NOT EXISTS messages_in (
               id            TEXT PRIMARY KEY,
               seq           INTEGER UNIQUE,
               kind          TEXT NOT NULL DEFAULT 'chat',
               timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
               status        TEXT NOT NULL DEFAULT 'pending',
               process_after TEXT,
               recurrence    TEXT,
               tries         INTEGER NOT NULL DEFAULT 0,
               trigger       INTEGER NOT NULL DEFAULT 1,
               platform_id   TEXT,
               channel_type  TEXT,
               thread_id     TEXT,
               content       TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS destinations (
               name          TEXT PRIMARY KEY,
               type          TEXT NOT NULL DEFAULT 'channel',
               channel_type  TEXT,
               platform_id   TEXT,
               metadata      TEXT
             );
             CREATE TABLE IF NOT EXISTS session_routing (
               key           TEXT PRIMARY KEY DEFAULT 'current',
               channel_type  TEXT,
               platform_id   TEXT,
               thread_id     TEXT
             );"
        )
        .map_err(err)?;
        Ok(())
    }

    fn init_outbound_schema(&self) -> Result<(), String> {
        let conn = Connection::open(self.outbound()).map_err(err)?;
        conn.execute_batch(
            "PRAGMA journal_mode = DELETE;
             CREATE TABLE IF NOT EXISTS messages_out (
               id            TEXT PRIMARY KEY,
               seq           INTEGER UNIQUE,
               in_reply_to   TEXT,
               timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
               deliver_after TEXT,
               recurrence    TEXT,
               kind          TEXT NOT NULL DEFAULT 'chat',
               platform_id   TEXT,
               channel_type  TEXT,
               thread_id     TEXT,
               content       TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS processing_ack (
               message_id    TEXT PRIMARY KEY,
               status        TEXT NOT NULL DEFAULT 'processing',
               updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
             );
             CREATE TABLE IF NOT EXISTS session_state (
               key           TEXT PRIMARY KEY,
               value         TEXT NOT NULL,
               updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
             );"
        )
        .map_err(err)?;
        Ok(())
    }

    fn get_next_seq(&self) -> Result<i64, String> {
        let conn_in = Connection::open(self.inbound()).map_err(err)?;
        let max_in: i64 = conn_in
            .query_row("SELECT COALESCE(MAX(seq), 0) FROM messages_in", [], |row| row.get(0))
            .unwrap_or(0);

        let conn_out = Connection::open(self.outbound()).map_err(err)?;
        let max_out: i64 = conn_out
            .query_row("SELECT COALESCE(MAX(seq), 0) FROM messages_out", [], |row| row.get(0))
            .unwrap_or(0);

        let max_seq = std::cmp::max(max_in, max_out);
        let next_seq = if max_seq % 2 == 0 { max_seq + 2 } else { max_seq + 1 };
        Ok(next_seq)
    }

    pub fn send(&self, _group_id: &str, content: &str, meta: &str) -> Result<i64, String> {
        let seq = self.get_next_seq()?;
        let conn = Connection::open(self.inbound()).map_err(err)?;
        
        let id = format!("{}-{}", chrono::Utc::now().timestamp_millis(), uuid::Uuid::new_v4().simple());
        
        let mut platform_id = meta.to_string();
        let mut channel_type = "chat".to_string();
        let mut thread_id = "default".to_string();
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(meta) {
            if let Some(p) = parsed.get("platformId").and_then(|x| x.as_str()) {
                platform_id = p.to_string();
            }
            if let Some(c) = parsed.get("channelType").and_then(|x| x.as_str()) {
                channel_type = c.to_string();
            }
            if let Some(t) = parsed.get("threadId").and_then(|x| x.as_str()) {
                thread_id = t.to_string();
            }
        }

        conn.execute(
            "INSERT INTO messages_in (id, seq, kind, status, platform_id, channel_type, thread_id, content)
             VALUES (?1, ?2, 'chat', 'pending', ?3, ?4, ?5, ?6)",
            (&id, &seq, &platform_id, &channel_type, &thread_id, content),
        )
        .map_err(err)?;

        Ok(seq)
    }

    pub fn receive(&self, _group_id: &str, after_id: i64) -> Result<Vec<OutboundMessage>, String> {
        let conn = Connection::open(self.outbound()).map_err(err)?;
        let mut stmt = conn
            .prepare(
                "SELECT seq, content FROM messages_out 
                 WHERE seq > ?1 
                 ORDER BY seq ASC",
            )
            .map_err(err)?;

        let rows = stmt
            .query_map([after_id], |row| {
                let seq: i64 = row.get(0)?;
                let content: String = row.get(1)?;
                
                let mut text = content.clone();
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(t) = parsed.get("text").and_then(|x| x.as_str()) {
                        text = t.to_string();
                    }
                }

                Ok(OutboundMessage {
                    id: seq,
                    group_id: "default".to_string(),
                    content: text,
                    created_at: chrono::Utc::now().timestamp(),
                })
            })
            .map_err(err)?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r.map_err(err)?);
        }
        Ok(results)
    }

    pub fn sync(&self, agents: &[AgentConfig], _active_id: Option<&str>) -> Result<(), String> {
        for agent in agents {
            let agent_dir = self.dir.join("agents").join(&agent.name);
            std::fs::create_dir_all(&agent_dir).map_err(err)?;

            if let Some(ref inst) = agent.instructions {
                std::fs::write(agent_dir.join("instructions.md"), inst).map_err(err)?;
            }
            if let Some(ref soul) = agent.soul {
                std::fs::write(agent_dir.join("soul.md"), soul).map_err(err)?;
            }
        }
        Ok(())
    }

    pub fn spawn_engine_with_config(
        &self,
        agent_name: &str,
        provider: &str,
        api_key: Option<&str>,
        base_url: Option<&str>,
        model: Option<&str>,
        app: Option<&tauri::AppHandle>,
    ) -> Result<bool, String> {
        self.stop_engine();

        let config_path = self.dir.join("runner.json");
        let config_json = serde_json::json!({
            "provider": provider,
            "assistantName": "V-Assistant",
            "agentName": agent_name,
            "maxMessagesPerPrompt": 10,
            "mcpServers": {},
            "model": model,
            "apiKey": api_key,
            "baseUrl": base_url
        });
        std::fs::write(&config_path, serde_json::to_string_pretty(&config_json).map_err(err)?)
            .map_err(err)?;

        let mut guard = self.engine.lock().map_err(|e| e.to_string())?;

        let project_dir = if let Ok(dir) = std::env::var("VUA_PROJECT_DIR") {
            PathBuf::from(dir)
        } else if let Some(app) = app {
            let Ok(resource_dir) = app.path().resource_dir() else {
                return Ok(false);
            };
            resource_dir
        } else {
            return Ok(false);
        };

        let child = spawn_process(&self.dir, &project_dir, &config_path)?;
        *guard = Some(child);

        println!("[tauri-runtime] Spawned agent-runner for agent: {}", agent_name);

        Ok(true)
    }

    pub fn spawn_engine(&self, app: Option<&tauri::AppHandle>) -> Result<bool, String> {
        let config_path = self.dir.join("runner.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    let agent_name = parsed.get("agentName").and_then(|x| x.as_str()).unwrap_or("default");
                    let provider = parsed.get("provider").and_then(|x| x.as_str()).unwrap_or("openai");
                    let api_key = parsed.get("apiKey").and_then(|x| x.as_str());
                    let base_url = parsed.get("baseUrl").and_then(|x| x.as_str());
                    let model = parsed.get("model").and_then(|x| x.as_str());
                    return self.spawn_engine_with_config(agent_name, provider, api_key, base_url, model, app);
                }
            }
        }
        self.spawn_engine_with_config("default", "openai", None, None, None, app)
    }

    pub fn status(&self) -> RuntimeStatus {
        let engine_running = self
            .engine
            .lock()
            .ok()
            .and_then(|mut g| g.as_mut().map(|c| c.try_wait().ok().flatten().is_none()))
            .unwrap_or(false);
        RuntimeStatus {
            version: env!("CARGO_PKG_VERSION"),
            engine_running,
            dir: self.dir.display().to_string(),
        }
    }

    pub fn stop_engine(&self) {
        if let Ok(mut guard) = self.engine.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
