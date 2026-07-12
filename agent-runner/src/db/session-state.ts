/**
 * Session state persistence (key-value store in outbound.db).
 *
 * Used to persist continuation tokens, provider state, and other
 * session-specific data across runner restarts.
 *
 * @ref NanoClaw/container/agent-runner/src/db/session-state.ts
 */
import { getOutboundDb } from './connection.js';

/**
 * Get a session state value by key.
 */
export function getSessionState(key: string): string | null {
  const db = getOutboundDb();
  const row = db.prepare('SELECT value FROM session_state WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * Set a session state value.
 */
export function setSessionState(key: string, value: string): void {
  const db = getOutboundDb();
  db.prepare(
    `INSERT OR REPLACE INTO session_state (key, value, updated_at)
     VALUES (?, ?, datetime('now'))`,
  ).run(key, value);
}

/**
 * Delete a session state value.
 */
export function deleteSessionState(key: string): void {
  const db = getOutboundDb();
  db.prepare('DELETE FROM session_state WHERE key = ?').run(key);
}

// --- Continuation helpers ---

function continuationKey(providerName: string): string {
  return `continuation:${providerName}`;
}

/**
 * Get the stored continuation token for a provider.
 */
export function getContinuation(providerName: string): string | undefined {
  return getSessionState(continuationKey(providerName)) ?? undefined;
}

/**
 * Store a continuation token for a provider.
 */
export function setContinuation(providerName: string, value: string): void {
  setSessionState(continuationKey(providerName), value);
}

/**
 * Clear the stored continuation token for a provider.
 */
export function clearContinuation(providerName: string): void {
  deleteSessionState(continuationKey(providerName));
}

// --- In-reply-to helpers ---

/**
 * Track the current message being replied to (for routing).
 */
export function setCurrentInReplyTo(messageId: string): void {
  setSessionState('current_in_reply_to', messageId);
}

export function getCurrentInReplyTo(): string | null {
  return getSessionState('current_in_reply_to');
}

export function clearCurrentInReplyTo(): void {
  deleteSessionState('current_in_reply_to');
}
