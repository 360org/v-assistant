//! Credential Vault — the app's secure store for user account secrets.
//!
//! Provider tokens/keys never sit in the UI or in plaintext on disk. They
//! live in the operating system's own secret store via the `keyring`
//! crate: macOS Keychain, Windows Credential Manager, or the Linux Secret
//! Service (GNOME Keyring / KWallet). This mirrors NanoClaw's "Agent
//! Vault": credentials are held apart from the app and injected only when a
//! request needs them.
//!
//! The frontend keeps only non-secret metadata (which provider, which
//! model, whether a key exists); the secret itself is read from here.

use keyring::Entry;

/// Namespace for all V Assistant entries in the OS store.
const SERVICE: &str = "com.vua.assistant";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Store (or replace) a secret under `key`.
#[tauri::command]
pub fn vault_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

/// Read a secret; `None` when nothing is stored under `key`.
#[tauri::command]
pub fn vault_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Remove a secret; succeeds even if it was never stored.
#[tauri::command]
pub fn vault_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
