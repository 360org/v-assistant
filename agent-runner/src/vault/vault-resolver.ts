/**
 * Local Vault secret resolver for the V-Assistant Agent Runner.
 *
 * Reads and decrypts credentials from `vault.db` which is shared with Tauri.
 * Decrypts values using the symmetric XOR hex-encoded cipher.
 */
import fs from 'fs';
import path from 'path';
import { openDatabase } from '../db/sqlite.js';

function log(msg: string): void {
  console.error(`[vault-resolver] ${msg}`);
}

const VAULT_KEY = Buffer.from('v-assistant-secure-vault-salt-key-360org');

/**
 * Decrypt a value from the database using XOR hex-decoded key.
 */
function decryptValue(encryptedHex: string): string {
  // Check if input is hex
  if (encryptedHex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(encryptedHex)) {
    return encryptedHex; // Return as-is if not hex
  }

  try {
    const bytes = Buffer.from(encryptedHex, 'hex');
    const decrypted = Buffer.alloc(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      decrypted[i] = bytes[i] ^ VAULT_KEY[i % VAULT_KEY.length];
    }
    return decrypted.toString('utf8');
  } catch (err) {
    log(`Failed to decrypt value: ${err instanceof Error ? err.message : String(err)}`);
    return encryptedHex;
  }
}

/**
 * Get the path to vault.db.
 */
function getVaultDbPath(): string | null {
  const dataDir = process.env.VUA_DATA_DIR || '/data';
  const dbPath = path.join(dataDir, 'vault.db');
  if (!fs.existsSync(dbPath)) {
    return null;
  }
  return dbPath;
}

/**
 * Fetch a decrypted raw key from secrets table.
 */
export function getVaultSecret(key: string): string | null {
  const dbPath = getVaultDbPath();
  if (!dbPath) return null;

  let db;
  try {
    db = openDatabase(dbPath, { readonly: true });
    const stmt = db.prepare('SELECT value FROM secrets WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    if (row && row.value) {
      return decryptValue(row.value);
    }
    return null;
  } catch (err) {
    log(`Error fetching key "${key}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    if (db) db.close();
  }
}

interface VaultField {
  label: string;
  value: string;
}

interface VaultEntry {
  id: string;
  label: string;
  url?: string;
  username?: string;
  password?: string;
  notes?: string;
  fields?: VaultField[];
}

interface VaultEntryMeta {
  id: string;
  label: string;
  service?: string;
}

/**
 * Look up a stored credential field by entry name (label/service) and field name.
 */
export function getCredentialField(entryName: string, fieldName: string): string | null {
  const indexRaw = getVaultSecret('vault-index');
  if (!indexRaw) return null;

  try {
    const index = JSON.parse(indexRaw) as VaultEntryMeta[];
    const query = entryName.toLowerCase().trim();
    
    // Search index for matching label or service
    const hit = index.find(
      (e) =>
        e.label.toLowerCase() === query ||
        (e.service && e.service.toLowerCase() === query) ||
        e.label.toLowerCase().includes(query)
    );

    if (!hit) return null;

    // Load entry details
    const entryRaw = getVaultSecret(`vault-entry:${hit.id}`);
    if (!entryRaw) return null;

    const entry = JSON.parse(entryRaw) as VaultEntry;
    const f = fieldName.toLowerCase().trim();

    // Built-in fields
    if (f === 'url' && entry.url) return entry.url;
    if ((f === 'username' || f === 'user') && entry.username) return entry.username;
    if ((f === 'password' || f === 'pass') && entry.password) return entry.password;
    if ((f === 'notes' || f === 'note') && entry.notes) return entry.notes;

    // Custom fields
    if (entry.fields) {
      const customField = entry.fields.find(
        (field) => field.label.toLowerCase().trim() === f
      );
      if (customField) return customField.value;
    }

    return null;
  } catch (err) {
    log(`Failed to resolve field "${fieldName}" for entry "${entryName}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Scan text for {{vault:Name.field}} placeholders and replace them with real secrets.
 */
export function resolveVaultPlaceholders(text: string): string {
  const placeholderRegex = /\{\{vault:([^.{}]+)\.([^.{}]+)\}\}/g;
  
  return text.replace(placeholderRegex, (match, entryName, fieldName) => {
    const secret = getCredentialField(entryName, fieldName);
    if (secret !== null) {
      return secret;
    }
    return match; // Keep placeholder if not found
  });
}
