import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface NanoClawMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface NanoClawSession {
  id: string;
  externalId: string;
  title: string;
  channel: "telegram";
  status: string;
  messages: NanoClawMessage[];
  createdAt: number;
  updatedAt: number;
}

type SessionRow = {
  id: string;
  agent_group_id: string;
  status: string;
  created_at: string;
  last_active: string;
};

type MessageRow = {
  id: string;
  timestamp: string;
  kind: string;
  platform_id: string | null;
  channel_type: string | null;
  content: string;
};

function timestamp(value: string): number {
  const normalized = value.includes("T") || /[zZ]|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function textContent(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : null;
  } catch {
    return raw.trim() || null;
  }
}

function readMessages(file: string, table: "messages_in" | "messages_out", role: NanoClawMessage["role"]): Array<NanoClawMessage & { platformId: string | null }> {
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare(
      `SELECT id, timestamp, kind, platform_id, channel_type, content FROM ${table} ORDER BY timestamp, seq`,
    ).all() as unknown as MessageRow[];
    return rows.flatMap((row) => {
      if (row.channel_type !== "telegram" || !["chat", "chat-sdk"].includes(row.kind)) return [];
      const content = textContent(row.content);
      // NanoClaw creates an internal welcome instruction as a chat row. It is
      // context for the agent, not a Telegram message the user sent.
      if (!content || (role === "user" && content.startsWith("System instruction:"))) return [];
      return [{ id: `nanoclaw:${row.id}`, role, content, createdAt: timestamp(row.timestamp), platformId: row.platform_id }];
    });
  } finally {
    db.close();
  }
}

export function readNanoClawSessions(root = process.env.NANOCLAW_DATA_DIR || "/nanoclaw-appdata/runtime/data"): NanoClawSession[] {
  const mainPath = path.join(root, "v2.db");
  if (!fs.existsSync(mainPath)) return [];
  const db = new DatabaseSync(mainPath, { readOnly: true });
  let rows: SessionRow[];
  try {
    rows = db.prepare(
      "SELECT id, agent_group_id, status, created_at, last_active FROM sessions ORDER BY last_active DESC",
    ).all() as unknown as SessionRow[];
  } finally {
    db.close();
  }

  return rows.flatMap((row) => {
    const sessionDir = path.join(root, "v2-sessions", row.agent_group_id, row.id);
    const inbound = readMessages(path.join(sessionDir, "inbound.db"), "messages_in", "user");
    const outbound = readMessages(path.join(sessionDir, "outbound.db"), "messages_out", "assistant");
    const all = [...inbound, ...outbound].sort((a, b) => a.createdAt - b.createdAt);
    const platformId = all.find((message) => message.platformId)?.platformId;
    if (!platformId?.startsWith("telegram:")) return [];
    const chatId = platformId.slice("telegram:".length);
    const messages = all.map(({ platformId: _platformId, ...message }) => message);
    return [{
      id: `telegram:${chatId}`,
      externalId: row.id,
      title: `Telegram ${chatId}`,
      channel: "telegram" as const,
      status: row.status,
      messages,
      createdAt: timestamp(row.created_at),
      updatedAt: messages.at(-1)?.createdAt ?? timestamp(row.last_active),
    }];
  });
}
