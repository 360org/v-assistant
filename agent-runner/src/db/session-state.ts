/**
 * Session state persistence (key-value store in outbound.db).
 *
 * Used to persist continuation tokens, provider state, and other
 * session-specific data across runner restarts.
 *
 * @ref NanoClaw/container/agent-runner/src/db/session-state.ts
 */
import { getOutboundDb } from './connection.js';
import type { ChatMessage } from '../providers/types.js';

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

function continuationKey(sessionId: string, providerName: string): string {
  return `session:${sessionId}:continuation:${providerName}`;
}

/**
 * Get the stored continuation token for a provider.
 */
export function getContinuation(sessionId: string, providerName: string): string | undefined {
  return getSessionState(continuationKey(sessionId, providerName)) ?? undefined;
}

/**
 * Store a continuation token for a provider.
 */
export function setContinuation(sessionId: string, providerName: string, value: string): void {
  setSessionState(continuationKey(sessionId, providerName), value);
}

/**
 * Clear the stored continuation token for a provider.
 */
export function clearContinuation(sessionId: string, providerName: string): void {
  deleteSessionState(continuationKey(sessionId, providerName));
}

const MAX_TRANSCRIPT_MESSAGES = 40;

function transcriptKey(sessionId: string): string {
  return `session:${sessionId}:transcript`;
}

export function getTranscript(sessionId: string): ChatMessage[] {
  const value = getSessionState(transcriptKey(sessionId));
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setTranscript(sessionId: string, messages: ChatMessage[]): void {
  setSessionState(transcriptKey(sessionId), JSON.stringify(messages.slice(-MAX_TRANSCRIPT_MESSAGES)));
}

export function clearTranscript(sessionId: string): void {
  deleteSessionState(transcriptKey(sessionId));
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
