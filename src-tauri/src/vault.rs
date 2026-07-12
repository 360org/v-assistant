//! Credential Vault — the app's secure store for user account secrets.
//!
//! Stores credentials in a local SQLite database (`vault.db`) inside the app's
//! data directory. Values are encrypted/decrypted using a XOR cipher with a local key
//! and hex-encoded to ensure portability without relying on OS Keychain/keyring
//! which can fail in headless, Docker, or server environments.

use rusqlite::Connection;
use tauri::State;
use crate::runtime::Runtime;

fn get_conn(state: &State<'_, Runtime>) -> Result<Connection, String> {
    let path = state.dir.join("vault.db");
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS secrets (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
         )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// Store (or replace) a secret under `key`.
#[tauri::command]
pub fn vault_set(state: State<'_, Runtime>, key: String, value: String) -> Result<(), String> {
    let conn = get_conn(&state)?;
    let encrypted = encrypt(&value);
    conn.execute(
        "INSERT OR REPLACE INTO secrets (key, value) VALUES (?1, ?2)",
        (&key, &encrypted),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Read a secret; `None` when nothing is stored under `key`.
#[tauri::command]
pub fn vault_get(state: State<'_, Runtime>, key: String) -> Result<Option<String>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare("SELECT value FROM secrets WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query([&key]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let encrypted: String = row.get(0).map_err(|e| e.to_string())?;
        match decrypt(&encrypted) {
            Ok(decrypted) => Ok(Some(decrypted)),
            Err(e) => Err(e),
        }
    } else {
        Ok(None)
    }
}

/// Remove a secret; succeeds even if it was never stored.
#[tauri::command]
pub fn vault_delete(state: State<'_, Runtime>, key: String) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM secrets WHERE key = ?1", [&key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn encrypt(input: &str) -> String {
    let key = b"v-assistant-secure-vault-salt-key-360org";
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    for (i, &b) in bytes.iter().enumerate() {
        output.push(b ^ key[i % key.len()]);
    }
    hex_encode(&output)
}

fn decrypt(input: &str) -> Result<String, String> {
    let key = b"v-assistant-secure-vault-salt-key-360org";
    let bytes = hex_decode(input)?;
    let mut output = Vec::with_capacity(bytes.len());
    for (i, &b) in bytes.iter().enumerate() {
        output.push(b ^ key[i % key.len()]);
    }
    String::from_utf8(output).map_err(|e| e.to_string())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("Invalid hex string length".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string())
        })
        .collect()
}
