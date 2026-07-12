/**
 * NanoClaw engine adapter — the desktop app acts as a NanoClaw channel.
 *
 * Messages go to the Rust runtime via Tauri commands, which queues them on
 * the engine's inbound SQLite database; replies come back on the outbound
 * queue, produced by the per-agent containers (Claude Agent SDK). This
 * module never renders anything: the UI only sees the `Engine` interface.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Engine, ChatMessage } from "./engine";
import type { ProviderId } from "@/lib/catalog";

interface OutboundMessage {
  id: number;
  group_id: string;
  content: string;
  created_at: number;
}

const POLL_INTERVAL_MS = 500;
const REPLY_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when running inside the Tauri shell (not the web preview). */
export function inDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True when a NanoClaw engine is attached behind the runtime. */
export async function engineRunning(): Promise<boolean> {
  if (!inDesktopShell()) return false;
  try {
    const status = await invoke<{ engine_running: boolean }>("runtime_status");
    return status.engine_running;
  } catch {
    return false;
  }
}

export const nanoclawEngine: Engine = {
  async *chat(
    messages: ChatMessage[],
    options: { provider: ProviderId; agentName?: string; agentId?: string },
  ) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Each installed agent maps to a NanoClaw group; plain chat is "main".
    const groupId = options.agentId ?? "main";

    const lastSeen = await latestOutboundId(groupId);
    await invoke<number>("runtime_send", {
      groupId,
      content: lastUser.content,
      meta: JSON.stringify({
        provider: options.provider,
        agent: options.agentName ?? null,
      }),
    });

    const deadline = Date.now() + REPLY_TIMEOUT_MS;
    let after = lastSeen;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const replies = await invoke<OutboundMessage[]>("runtime_receive", {
        groupId,
        afterId: after,
      });
      for (const reply of replies) {
        after = reply.id;
        yield reply.content;
      }
      if (replies.length > 0) return;
    }
    throw new Error("The assistant did not reply in time. Please try again.");
  },
};

async function latestOutboundId(groupId: string): Promise<number> {
  const backlog = await invoke<OutboundMessage[]>("runtime_receive", {
    groupId,
    afterId: 0,
  });
  return backlog.length ? backlog[backlog.length - 1].id : 0;
}

/** Push installed agents to the runtime so the engine has their groups. */
export async function syncAgents(
  agents: { id: string; name: string; description: string; instructions?: string; soul?: string }[],
): Promise<void> {
  if (!inDesktopShell()) return;
  try {
    await invoke("runtime_sync", { agents });
  } catch (err) {
    console.error("Failed to sync agents:", err);
  }
}

/** Restart the agent runner process with new configurations. */
export async function restartAgentRunner(
  agentName: string,
  provider: string,
  apiKey?: string | null,
  baseUrl?: string | null,
  model?: string | null,
): Promise<boolean> {
  if (!inDesktopShell()) return false;
  try {
    return await invoke<boolean>("runtime_restart_runner", {
      agentName,
      provider,
      apiKey: apiKey || null,
      baseUrl: baseUrl || null,
      model: model || null,
    });
  } catch (err) {
    console.error("Failed to restart agent runner:", err);
    return false;
  }
}
