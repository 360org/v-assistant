/**
 * Inbound message operations (runner side).
 *
 * Reads from inbound.db (host-owned, opened read-only).
 * Writes processing status to processing_ack in outbound.db.
 *
 * The runner never writes to inbound.db — all status tracking goes through
 * processing_ack. The host reads processing_ack to sync message lifecycle.
 *
 * @ref NanoClaw/container/agent-runner/src/db/messages-in.ts
 */
import { openInboundDb, getOutboundDb } from './connection.js';

export interface MessageInRow {
  id: string;
  seq: number | null;
  kind: string;
  timestamp: string;
  status: string;
  process_after: string | null;
  recurrence: string | null;
  tries: number;
  /** 1 = wake-eligible (default); 0 = accumulated context only */
  trigger: number;
  platform_id: string | null;
  channel_type: string | null;
  thread_id: string | null;
  content: string;
}

const DEFAULT_MAX_MESSAGES = 10;
let _maxMessages: number | null = null;

export function setMaxMessagesPerPrompt(n: number): void {
  _maxMessages = n;
}

function getMaxMessagesPerPrompt(): number {
  return _maxMessages ?? DEFAULT_MAX_MESSAGES;
}

/**
 * Fetch pending messages that are due for processing.
 * Reads from inbound.db (read-only), filters against processing_ack in outbound.db.
 *
 * Returns the most recent `maxMessagesPerPrompt` pending rows in
 * chronological order.
 *
 * @ref NanoClaw messages-in.ts — getPendingMessages()
 */
export function getPendingMessages(isFirstPoll = false): MessageInRow[] {
  const inbound = openInboundDb();
  const outbound = getOutboundDb();

  try {
    // Get all pending messages from inbound
    const pending = inbound
      .prepare(
        `SELECT * FROM messages_in
         WHERE status = 'pending'
           AND (process_after IS NULL OR datetime(process_after) <= datetime('now'))
         ORDER BY seq DESC
         LIMIT ?`,
      )
      .all(getMaxMessagesPerPrompt()) as MessageInRow[];

    if (pending.length === 0) return [];

    // Filter out messages already being processed (check processing_ack)
    const ids = pending.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const acked = new Set(
      (
        outbound
          .prepare(`SELECT message_id FROM processing_ack WHERE message_id IN (${placeholders})`)
          .all(...ids) as Array<{ message_id: string }>
      ).map((r) => r.message_id),
    );

    const unacked = pending.filter((m) => !acked.has(m.id));
    if (unacked.length === 0) return [];

    // Never mix two conversations in one model request. Anchor on the newest
    // due message; other routes remain pending for the following poll.
    const anchor = unacked[0];
    return unacked
      .filter(
        (m) =>
          m.channel_type === anchor.channel_type &&
          m.platform_id === anchor.platform_id &&
          m.thread_id === anchor.thread_id,
      )
      .reverse();
  } finally {
    inbound.close();
  }
}

/**
 * Mark messages as 'processing' in the outbound processing_ack table.
 */
export function markProcessing(ids: string[]): void {
  const outbound = getOutboundDb();
  const stmt = outbound.prepare(
    `INSERT OR REPLACE INTO processing_ack (message_id, status, updated_at)
     VALUES (?, 'processing', datetime('now'))`,
  );
  for (const id of ids) {
    stmt.run(id);
  }
}

/**
 * Mark messages as 'completed' in processing_ack.
 */
export function markCompleted(ids: string[]): void {
  const outbound = getOutboundDb();
  const stmt = outbound.prepare(
    `INSERT OR REPLACE INTO processing_ack (message_id, status, updated_at)
     VALUES (?, 'completed', datetime('now'))`,
  );
  for (const id of ids) {
    stmt.run(id);
  }
}

export interface WriteMessageIn {
  id: string;
  kind?: string;
  process_after?: string | null;
  recurrence?: string | null;
  trigger?: number;
  platform_id?: string | null;
  channel_type?: string | null;
  thread_id?: string | null;
  content: string;
}

/**
 * Write a new inbound message (host/adapter side), auto-assigning an even seq number.
 * Host/Tauri uses even seq (2, 4, 6...), Runner uses odd (1, 3, 5...).
 */
export async function writeMessageIn(msg: WriteMessageIn): Promise<number> {
  const { openInboundDbWritable, getOutboundDb } = await import('./connection.js');
  const inbound = openInboundDbWritable();
  const outbound = getOutboundDb();

  try {
    // Read max seq from both DBs to maintain global ordering
    const maxIn = (inbound.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM messages_in').get() as { m: number }).m;
    const maxOut = (outbound.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM messages_out').get() as { m: number }).m;
    const max = Math.max(maxIn, maxOut);
    const nextSeq = max % 2 === 0 ? max + 2 : max + 1; // next even

    inbound
      .prepare(
        `INSERT INTO messages_in (id, seq, kind, timestamp, status, process_after, recurrence, tries, trigger, platform_id, channel_type, thread_id, content)
         VALUES (?, ?, ?, datetime('now'), 'pending', ?, ?, 0, ?, ?, ?, ?, ?)`
      )
      .run(
        msg.id,
        nextSeq,
        msg.kind ?? 'chat',
        msg.process_after ?? null,
        msg.recurrence ?? null,
        msg.trigger ?? 1,
        msg.platform_id ?? null,
        msg.channel_type ?? null,
        msg.thread_id ?? null,
        msg.content
      );

    return nextSeq;
  } finally {
    inbound.close();
  }
}
