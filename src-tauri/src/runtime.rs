//! AI Runtime Service — the desktop side of the NanoClaw engine boundary.
//!
//! NanoClaw's contract is channel-shaped: messaging apps write inbound
//! messages, the host routes them to per-group agent containers (Claude
//! Agent SDK), and replies come back on an outbound queue. IPC is SQLite —
//! two files per session, each with a single writer, so there is no lock
//! contention:
//!
//!   V Assistant UI → this module → ipc/inbound.db → NanoClaw host
//!                                                     ↓ (container)
//!   V Assistant UI ← this module ← ipc/outbound.db ← NanoClaw host
//!
//! The desktop app is therefore just another NanoClaw channel, exactly like
//! WhatsApp or Telegram. The engine itself (Node host + Docker containers)
//! lives outside this repo; `spawn_engine` looks for an installation and
//! runs it in the background. None of this — NanoClaw, containers, SQLite —
//! is ever surfaced in the UI.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// App-facing engine state, managed by Tauri.
pub struct Runtime {
    pub dir: PathBuf,
    engine: Mutex<Option<Child>>,
}

#[derive(Serialize)]
pub struct RuntimeStatus {
    pub version: &'static str,
    /// True when a NanoClaw engine process is attached and alive.
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

/// One agent definition to materialize as a NanoClaw group.
#[derive(Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub description: String,
}

impl Runtime {
    pub fn new(dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(dir.join("ipc")).map_err(err)?;
        std::fs::create_dir_all(dir.join("groups")).map_err(err)?;
        let runtime = Runtime {
            dir,
            engine: Mutex::new(None),
        };
        // Both queues are created by the desktop side so a first launch
        // works before any engine is installed; the schema is the desktop
        // channel contract the engine's adapter reads.
        runtime.open(runtime.inbound())?;
        runtime.open(runtime.outbound())?;
        Ok(runtime)
    }

    fn inbound(&self) -> PathBuf {
        self.dir.join("ipc/inbound.db")
    }

    fn outbound(&self) -> PathBuf {
        self.dir.join("ipc/outbound.db")
    }

    fn open(&self, path: PathBuf) -> Result<Connection, String> {
        let conn = Connection::open(path).map_err(err)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS messages (
               id         INTEGER PRIMARY KEY AUTOINCREMENT,
               group_id   TEXT NOT NULL,
               sender     TEXT NOT NULL,
               content    TEXT NOT NULL,
               meta       TEXT NOT NULL DEFAULT '{}',
               created_at INTEGER NOT NULL
             );",
        )
        .map_err(err)?;
        Ok(conn)
    }

    /// Queue a user message for the engine. Returns the inbound row id.
    pub fn send(&self, group_id: &str, content: &str, meta: &str) -> Result<i64, String> {
        let conn = self.open(self.inbound())?;
        conn.execute(
            "INSERT INTO messages (group_id, sender, content, meta, created_at)
             VALUES (?1, 'user', ?2, ?3, unixepoch())",
            (group_id, content, meta),
        )
        .map_err(err)?;
        Ok(conn.last_insert_rowid())
    }

    /// Fetch engine replies for a group newer than `after_id`.
    pub fn receive(&self, group_id: &str, after_id: i64) -> Result<Vec<OutboundMessage>, String> {
        let conn = self.open(self.outbound())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, group_id, content, created_at FROM messages
                 WHERE group_id = ?1 AND id > ?2 ORDER BY id",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map((group_id, after_id), |row| {
                Ok(OutboundMessage {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    content: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)
    }

    /// Materialize app state as NanoClaw groups: one folder per agent with
    /// a CLAUDE.md, plus the shared skills directory copied alongside so
    /// containers can mount it. Idempotent.
    pub fn sync(&self, agents: &[AgentConfig], skills_dir: Option<&Path>) -> Result<(), String> {
        for agent in agents {
            let group = self.dir.join("groups").join(&agent.id);
            std::fs::create_dir_all(&group).map_err(err)?;
            std::fs::write(
                group.join("CLAUDE.md"),
                format!(
                    "# {}\n\nYou are the user's {}.\n\n{}\n\nAnswer in the user's language.\n",
                    agent.name, agent.name, agent.description
                ),
            )
            .map_err(err)?;
        }
        if let Some(src) = skills_dir {
            copy_dir(src, &self.dir.join("skills"))?;
        }
        Ok(())
    }

    /// Attach a NanoClaw engine: spawn its host process pointed at our IPC
    /// directory. The install location comes from `VUA_ENGINE_DIR` (a
    /// NanoClaw checkout with a desktop channel) — absent that, the app
    /// keeps running on the built-in preview engine.
    pub fn spawn_engine(&self) -> Result<bool, String> {
        let mut guard = self.engine.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.as_mut() {
            if child.try_wait().map_err(err)?.is_none() {
                return Ok(true); // already running
            }
        }
        let Ok(engine_dir) = std::env::var("VUA_ENGINE_DIR") else {
            return Ok(false);
        };
        let entry = PathBuf::from(&engine_dir);
        if !entry.exists() {
            return Err(format!("engine entry not found: {}", entry.display()));
        }
        // Detach stdio: the engine must not inherit (and hold open) the
        // app's pipes; its own logging lives in the runtime dir.
        let child = Command::new("node")
            .arg(&entry)
            .env("VUA_RUNTIME_DIR", &self.dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(err)?;
        *guard = Some(child);
        Ok(true)
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

fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(err)?;
    for entry in std::fs::read_dir(src).map_err(err)? {
        let entry = entry.map_err(err)?;
        let target = dst.join(entry.file_name());
        if entry.file_type().map_err(err)?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target).map_err(err)?;
        }
    }
    Ok(())
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
