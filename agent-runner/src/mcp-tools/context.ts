/**
 * Per-turn routing context for built-in MCP tools.
 *
 * The poll loop is sequential, so the active context is set only while a
 * provider response is being handled. It is deliberately not persisted: the
 * source of truth remains the inbound IPC message.
 */
import type { RoutingContext } from '../formatter.js';
import { getInboundDb } from '../db/index.js';

export interface BuiltinToolContext {
  routing: RoutingContext;
  inReplyTo?: string;
}

let activeContext: BuiltinToolContext | null = null;

export function setBuiltinToolContext(context: BuiltinToolContext): void {
  activeContext = context;
}

export function clearBuiltinToolContext(): void {
  activeContext = null;
}

export function getBuiltinToolContext(): BuiltinToolContext {
  if (activeContext) return activeContext;

  // A standalone MCP stdio invocation has no poll-loop turn. The host may
  // expose an explicit current routing row for this supported case.
  const row = getInboundDb()
    .prepare("SELECT platform_id, channel_type, thread_id FROM session_routing WHERE key = 'current'")
    .get() as { platform_id: string | null; channel_type: string | null; thread_id: string | null } | undefined;
  if (!row) throw new Error('No active conversation routing is available for this MCP call.');
  return {
    routing: { platformId: row.platform_id, channelType: row.channel_type, threadId: row.thread_id },
  };
}
