/**
 * Outbound message operations (runner side).
 *
 * Writes to outbound.db (runner-owned).
 * The host polls this DB (read-only) for undelivered messages.
 *
 * Seq numbering: odd for runner, even for host (avoid collision).
 *
 * @ref NanoClaw/container/agent-runner/src/db/messages-out.ts
 */
import { getInboundDb, getOutboundDb } from './connection.js';

export interface MessageOutRow {
  id: string;
  seq: number | null;
  in_reply_to: string | null;
  timestamp: string;
  deliver_after: string | null;
  recurrence: string | null;
  kind: string;
  platform_id: string | null;
  channel_type: string | null;
  thread_id: string | null;
  content: string;
}

export interface WriteMessageOut {
  id: string;
  in_reply_to?: string | null;
  deliver_after?: string | null;
  recurrence?: string | null;
  kind: string;
  platform_id?: string | null;
  channel_type?: string | null;
  thread_id?: string | null;
  content: string;
}

/**
 * Write a new outbound message, auto-assigning an odd seq number.
 * Runner uses odd seq (1, 3, 5...), host uses even (2, 4, 6...).
 *
 * The disjoint namespace prevents seq collision between runner and host.
 *
 * @ref NanoClaw messages-out.ts — writeMessageOut()
 */
export function writeMessageOut(msg: WriteMessageOut): number {
  const outbound = getOutboundDb();
  const inbound = getInboundDb();

  // Read max seq from both DBs to maintain global ordering
  const maxOut = (outbound.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM messages_out').get() as { m: number }).m;
  const maxIn = (inbound.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM messages_in').get() as { m: number }).m;
  const max = Math.max(maxOut, maxIn);
  const nextSeq = max % 2 === 0 ? max + 1 : max + 2; // next odd

  outbound
    .prepare(
      `INSERT INTO messages_out (id, seq, in_reply_to, timestamp, deliver_after, recurrence, kind, platform_id, channel_type, thread_id, content)
       VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      msg.id,
      nextSeq,
      msg.in_reply_to ?? null,
      msg.deliver_after ?? null,
      msg.recurrence ?? null,
      msg.kind,
      msg.platform_id ?? null,
      msg.channel_type ?? null,
      msg.thread_id ?? null,
      msg.content,
    );

  return nextSeq;
}

/**
 * Look up a message's platform ID by seq number.
 * Searches both inbound and outbound tables.
 */
export function getMessageIdBySeq(seq: number): string | null {
  const outbound = getOutboundDb();
  const inbound = getInboundDb();

  const outRow = outbound.prepare('SELECT id FROM messages_out WHERE seq = ?').get(seq) as { id: string } | undefined;
  if (outRow) return outRow.id;

  const inRow = inbound.prepare('SELECT id FROM messages_in WHERE seq = ?').get(seq) as { id: string } | undefined;
  if (inRow) return inRow.id;

  return null;
}

/**
 * Look up routing info (channel_type, platform_id, thread_id) by seq number.
 */
export function getRoutingBySeq(seq: number): {
  channel_type: string | null;
  platform_id: string | null;
  thread_id: string | null;
} | null {
  const outbound = getOutboundDb();
  const inbound = getInboundDb();
  const outRow = outbound
    .prepare('SELECT channel_type, platform_id, thread_id FROM messages_out WHERE seq = ?')
    .get(seq) as { channel_type: string | null; platform_id: string | null; thread_id: string | null } | undefined;
  if (outRow) return outRow;
  const inRow = inbound
    .prepare('SELECT channel_type, platform_id, thread_id FROM messages_in WHERE seq = ?')
    .get(seq) as { channel_type: string | null; platform_id: string | null; thread_id: string | null } | undefined;
  return inRow ?? null;
}

/**
 * Mark outbound messages as delivered in the outbound_delivery_ack table.
 */
export function markOutboundDelivered(ids: string[]): void {
  const outbound = getOutboundDb();
  const stmt = outbound.prepare(
    `INSERT OR REPLACE INTO outbound_delivery_ack (message_id, status, updated_at)
     VALUES (?, 'delivered', datetime('now'))`
  );
  for (const id of ids) {
    stmt.run(id);
  }
}

/**
 * Check if an outbound message has already been delivered.
 */
export function isOutboundDelivered(id: string): boolean {
  const outbound = getOutboundDb();
  const row = outbound
    .prepare('SELECT status FROM outbound_delivery_ack WHERE message_id = ?')
    .get(id) as { status: string } | undefined;
  return !!row;
}
