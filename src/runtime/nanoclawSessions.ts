import type { ChatMessage } from "./engine";

export interface SyncedNanoClawSession {
  id: string;
  externalId: string;
  title: string;
  channel: "telegram";
  status: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export async function fetchNanoClawSessions(): Promise<SyncedNanoClawSession[]> {
  const response = await fetch("/api/nanoclaw/sessions", { cache: "no-store" });
  if (!response.ok) throw new Error(`NanoClaw sessions unavailable (${response.status})`);
  const data = await response.json() as { sessions?: SyncedNanoClawSession[] };
  return data.sessions ?? [];
}
