/**
 * Credential Vault — front-end access to the secure secret store.
 *
 * On the desktop the secret lives in the OS keychain (via the Rust
 * `vault_*` commands); nothing sensitive is written to app storage. In the
 * browser there is no OS keychain, so we fall back to localStorage with a
 * clear namespace — acceptable for the web preview, and the desktop build
 * is the one that ships to users.
 */

const WEB_PREFIX = "v-assistant-vault:";

function inDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function vaultSet(key: string, value: string): Promise<void> {
  if (inDesktopShell()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("vault_set", { key, value });
    return;
  }
  try {
    localStorage.setItem(WEB_PREFIX + key, value);
  } catch {
    /* preview without persistence */
  }
}

export async function vaultGet(key: string): Promise<string | null> {
  if (inDesktopShell()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<string | null>("vault_get", { key })) ?? null;
  }
  try {
    return localStorage.getItem(WEB_PREFIX + key);
  } catch {
    return null;
  }
}

export async function vaultDelete(key: string): Promise<void> {
  if (inDesktopShell()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("vault_delete", { key });
    return;
  }
  try {
    localStorage.removeItem(WEB_PREFIX + key);
  } catch {
    /* no-op */
  }
}

/** True when running inside the Tauri desktop shell (OS keychain available). */
export function vaultIsSecure(): boolean {
  return inDesktopShell();
}
