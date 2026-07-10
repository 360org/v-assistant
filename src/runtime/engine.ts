/**
 * AI Runtime Service — the only place the UI talks to when it needs a model.
 *
 *   V Assistant Desktop  →  AI Runtime (this module)  →  Engine
 *
 * The engine behind this interface is an implementation detail and is never
 * surfaced in the UI. Today it ships with a local demo engine so the app is
 * fully navigable offline; wiring a real provider only means replacing
 * `createEngine` — no UI changes.
 */

import { getProvider, type ProviderId } from "@/lib/catalog";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface Engine {
  /** Streams the assistant reply as text chunks. */
  chat(
    messages: ChatMessage[],
    options: { provider: ProviderId; agentName?: string },
  ): AsyncGenerator<string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Demo engine: streams a canned, context-aware reply so the full product
 * experience (streaming, typing indicator, provider switching) works before
 * any account is wired up.
 */
const demoEngine: Engine = {
  async *chat(messages, { provider, agentName }) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const providerName = getProvider(provider).name;
    const persona = agentName ? ` as your ${agentName}` : "";
    const reply =
      `You said: “${lastUser?.content ?? ""}”.\n\n` +
      `I'm V Assistant, running${persona} on ${providerName}. ` +
      `This is a preview response — once your ${providerName} account is ` +
      `connected, real answers will stream here. Everything else already ` +
      `works: switch providers in one click, install agents from the store, ` +
      `and drop files into Knowledge to teach me about your work.`;

    // Stream word by word to exercise the same code path a real
    // network-streamed response will use.
    for (const word of reply.split(/(?<=\s)/)) {
      await sleep(24);
      yield word;
    }
  },
};

export function createEngine(): Engine {
  return demoEngine;
}

export function newMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
