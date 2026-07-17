import type { RoutingContext } from '../formatter.js';
import { getInboundDb } from './connection.js';

function component(value: string | null | undefined, fallback: string): string {
  return encodeURIComponent(value || fallback);
}

/** Stable identity for one agent conversation. */
export function sessionIdFor(agentId: string, routing: RoutingContext): string {
  return [
    component(agentId, 'default-agent'),
    component(routing.channelType, 'chat'),
    component(routing.platformId, 'local'),
    component(routing.threadId, 'default'),
  ].join('~');
}

/** Current host-provided routing, compatible with NanoClaw MCP tools. */
export function getSessionRouting(): { channel_type: string | null; platform_id: string | null; thread_id: string | null } {
  try {
    const row = getInboundDb()
      .prepare("SELECT channel_type, platform_id, thread_id FROM session_routing WHERE key = 'current'")
      .get() as { channel_type: string | null; platform_id: string | null; thread_id: string | null } | undefined;
    if (row) return row;
  } catch {
    // An older host may not have session_routing yet.
  }
  return { channel_type: null, platform_id: null, thread_id: null };
}
