//! Knowledge store — the documents a role can be asked about.
//!
//! Chunks used to live in the webview's IndexedDB, which put them out of reach
//! of the Agent Runner: the runner answers chat, Telegram and scheduled tasks,
//! so grounding a reply in the user's files never actually happened there.
//! They now live in `knowledge.db` beside the message queues.
//!
//! Ownership mirrors `inbound.db`: the app writes (it is the side holding the
//! picked file and the extracted text), the runner opens it read-only to
//! retrieve. Neither side writes the other's storage.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn db_path(dir: &Path) -> PathBuf {
    dir.join("ipc/knowledge.db")
}

/// One stored document, without its text.
#[derive(Serialize, Deserialize)]
pub struct KnowledgeRecord {
    pub file_id: String,
    pub bucket: String,
    pub name: String,
    /// Inline preview for images; absent for documents.
    pub data_url: Option<String>,
    pub added_at: i64,
    /// Total characters of extracted text, shown as the file size in the UI.
    pub size: i64,
}

/// A document plus its chunks, used to preview a file and to feed retrieval.
#[derive(Serialize)]
pub struct KnowledgeContent {
    pub name: String,
    pub chunks: Vec<String>,
    pub data_url: Option<String>,
}

pub fn init_schema(dir: &Path) -> Result<(), String> {
    let conn = Connection::open(db_path(dir)).map_err(err)?;
    conn.execute_batch(
        "PRAGMA journal_mode = DELETE;
         CREATE TABLE IF NOT EXISTS knowledge_files (
           file_id   TEXT PRIMARY KEY,
           bucket    TEXT NOT NULL,
           name      TEXT NOT NULL,
           data_url  TEXT,
           added_at  INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS knowledge_chunks (
           file_id   TEXT NOT NULL,
           bucket    TEXT NOT NULL,
           idx       INTEGER NOT NULL,
           text      TEXT NOT NULL,
           PRIMARY KEY (file_id, idx)
         );
         CREATE INDEX IF NOT EXISTS knowledge_chunks_bucket ON knowledge_chunks(bucket);",
    )
    .map_err(err)?;
    Ok(())
}

/// Store one document, replacing any previous version of it.
pub fn put(
    dir: &Path,
    file_id: &str,
    bucket: &str,
    name: &str,
    chunks: &[String],
    data_url: Option<&str>,
) -> Result<(), String> {
    let mut conn = Connection::open(db_path(dir)).map_err(err)?;
    let tx = conn.transaction().map_err(err)?;
    tx.execute("DELETE FROM knowledge_chunks WHERE file_id = ?1", [file_id])
        .map_err(err)?;
    tx.execute(
        "INSERT OR REPLACE INTO knowledge_files (file_id, bucket, name, data_url, added_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![file_id, bucket, name, data_url, chrono::Utc::now().timestamp_millis()],
    )
    .map_err(err)?;
    for (idx, text) in chunks.iter().enumerate() {
        tx.execute(
            "INSERT INTO knowledge_chunks (file_id, bucket, idx, text) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![file_id, bucket, idx as i64, text],
        )
        .map_err(err)?;
    }
    tx.commit().map_err(err)
}

pub fn delete(dir: &Path, file_id: &str) -> Result<(), String> {
    let conn = Connection::open(db_path(dir)).map_err(err)?;
    conn.execute("DELETE FROM knowledge_chunks WHERE file_id = ?1", [file_id])
        .map_err(err)?;
    conn.execute("DELETE FROM knowledge_files WHERE file_id = ?1", [file_id])
        .map_err(err)?;
    Ok(())
}

pub fn clear(dir: &Path) -> Result<(), String> {
    let conn = Connection::open(db_path(dir)).map_err(err)?;
    conn.execute_batch("DELETE FROM knowledge_chunks; DELETE FROM knowledge_files;")
        .map_err(err)
}

pub fn get(dir: &Path, file_id: &str) -> Result<Option<KnowledgeContent>, String> {
    let conn = Connection::open(db_path(dir)).map_err(err)?;
    let meta = conn
        .query_row(
            "SELECT name, data_url FROM knowledge_files WHERE file_id = ?1",
            [file_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .ok();
    let Some((name, data_url)) = meta else { return Ok(None) };

    let mut stmt = conn
        .prepare("SELECT text FROM knowledge_chunks WHERE file_id = ?1 ORDER BY idx")
        .map_err(err)?;
    let chunks = stmt
        .query_map([file_id], |row| row.get::<_, String>(0))
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;

    Ok(Some(KnowledgeContent { name, chunks, data_url }))
}

/// Every document, or only those in one role's bucket. The caller decides what
/// to show — documents and images share the store.
pub fn list(dir: &Path, bucket: Option<&str>) -> Result<Vec<KnowledgeRecord>, String> {
    let conn = Connection::open(db_path(dir)).map_err(err)?;
    let sql = "SELECT f.file_id, f.bucket, f.name, f.data_url, f.added_at,
                      COALESCE((SELECT SUM(LENGTH(c.text)) FROM knowledge_chunks c WHERE c.file_id = f.file_id), 0)
               FROM knowledge_files f";
    let mut stmt = conn
        .prepare(&match bucket {
            Some(_) => format!("{sql} WHERE f.bucket = ?1 ORDER BY f.added_at DESC"),
            None => format!("{sql} ORDER BY f.added_at DESC"),
        })
        .map_err(err)?;

    let map = |row: &rusqlite::Row| {
        Ok(KnowledgeRecord {
            file_id: row.get(0)?,
            bucket: row.get(1)?,
            name: row.get(2)?,
            data_url: row.get(3)?,
            added_at: row.get(4)?,
            size: row.get(5)?,
        })
    };
    let rows = match bucket {
        Some(b) => stmt.query_map([b], map).map_err(err)?.collect::<Result<Vec<_>, _>>(),
        None => stmt.query_map([], map).map_err(err)?.collect::<Result<Vec<_>, _>>(),
    };
    rows.map_err(err)
}
