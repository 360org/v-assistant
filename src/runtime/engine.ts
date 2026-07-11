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
import {
  isConfigured,
  streamProvider,
  type ProviderConfig,
} from "./providers";
import { buildAgentTools } from "./tools";
import { DEMO_MODE } from "./oauth";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ChatOptions {
  provider: ProviderId;
  /** Credentials for the provider; real calls happen when present. */
  config?: ProviderConfig;
  agentName?: string;
  agentDescription?: string;
  /** The agent's configured workflow/process instructions. */
  agentInstructions?: string;
  /** The agent's personality/voice ("soul"). */
  agentSoul?: string;
  /** The agent's persistent memory notes. */
  agentMemory?: string[];
  /** Installed-agent id; maps to a NanoClaw group on the engine side. */
  agentId?: string;
  /** Active skill's name — shown to the model as the task it's running. */
  skillName?: string;
  /** Active skill's full SKILL.md instructions, injected as guidance. */
  skillInstructions?: string;
}

export interface Engine {
  /** Streams the assistant reply as text chunks. */
  chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<string>;
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

/** The persona sent to real providers as the system prompt. */
function buildSystemPrompt(options: ChatOptions): string {
  let prompt =
    "You are V Assistant, a helpful personal AI assistant for everyday " +
    "work. Be concise and concrete. Always answer in the user's language.\n\n" +
    "You can act on the user's behalf using tools. The user keeps logins, " +
    "API keys and endpoints in their Vault. When a task needs a credential " +
    "(e.g. \"post this to my blog\"), call vault_list to see what is stored, " +
    "then use http_request to perform the action — reference any secret as " +
    "{{vault:<name>.<field>}} so you never handle the raw value. Do not ask " +
    "the user for a password that is already in the Vault.";
  if (options.agentName) {
    prompt +=
      `\n\nYou are currently acting as the user's ${options.agentName}. ` +
      `${options.agentDescription ?? ""}`;
    if (options.agentSoul) {
      prompt += `\n\nYour personality:\n${options.agentSoul}`;
    }
    if (options.agentInstructions) {
      prompt += `\n\nHow you work (follow this process):\n${options.agentInstructions}`;
    }
    const memory = (options.agentMemory ?? []).filter((m) => m.trim());
    if (memory.length) {
      prompt +=
        `\n\nWhat you remember about the user (use it when relevant):\n` +
        memory.map((m) => `- ${m}`).join("\n");
    }
  }
  // The active skill's full instructions steer how the model does the task.
  if (options.skillInstructions) {
    prompt +=
      `\n\nYou are performing the "${options.skillName ?? "task"}" skill. ` +
      `Follow these instructions exactly:\n\n${options.skillInstructions}`;
  }
  return prompt;
}

/** Streams from the selected provider's real API. */
const providerEngine: Engine = {
  async *chat(messages, options) {
    yield* streamProvider(
      options.provider,
      options.config!,
      buildSystemPrompt(options),
      messages,
      buildAgentTools(),
    );
  },
};

/**
 * Engine selection, decided per message:
 *  1. Desktop shell with a NanoClaw engine attached → the agent runtime.
 *  2. Provider configured (API key / local server) → real provider API.
 *  3. Otherwise → the built-in preview engine, so the app is always usable.
 */
export function createEngine(): Engine {
  return {
    async *chat(messages, options) {
      // Demo build has no real backend and a strict CSP: always preview.
      if (DEMO_MODE) {
        yield* demoEngine.chat(messages, options);
        return;
      }
      const { engineRunning, nanoclawEngine } = await import("./nanoclaw");
      if (await engineRunning()) {
        yield* nanoclawEngine.chat(messages, options);
        return;
      }
      if (isConfigured(options.provider, options.config)) {
        yield* providerEngine.chat(messages, options);
        return;
      }
      yield* demoEngine.chat(messages, options);
    },
  };
}

export function newMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
