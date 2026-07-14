/**
 * Real AI provider clients — streaming chat over each vendor's public API.
 *
 * All three protocols are browser-callable (CORS-enabled by the vendors):
 *  - OpenAI-compatible (OpenRouter, Local AI via Ollama/LM Studio, OpenAI)
 *  - Anthropic Messages API (with the direct-browser-access header)
 *  - Google Gemini streamGenerateContent
 *
 * Keys are held in app state only — never sent anywhere except the vendor.
 */

import type { ProviderId } from "@/lib/catalog";
import type { ChatMessage } from "./engine";
import type { AgentTool } from "./tools";
import { devUrl } from "./proxy";
import { vaultGet } from "./vault";

/** Safety bound on the tool-calling loop (tool → result → model → …). */
const MAX_TOOL_ROUNDS = 6;

export interface ProviderConfig {
  apiKey?: string;
  /** OpenAI-compatible base URL — used by Local AI (Ollama, LM Studio). */
  baseUrl?: string;
  /** Model override; each provider has a sensible default. */
  model?: string;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  chatgpt: "gpt-4o-mini",
  claude: "claude-3-5-sonnet-20241022",
  gemini: "gemini-2.5-flash",
  openrouter: "openrouter/auto",
  local: "llama3.2",
};

/** The router all direct sign-ins go through (OpenRouter-style). */
export const ROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Model each "Login with …" maps to when signing in through the router —
 * so "Continue with ChatGPT" reaches GPT, "Continue with Claude" reaches
 * Claude, etc., all from one login and with no API key.
 */
export const ROUTED_MODELS: Record<ProviderId, string> = {
  chatgpt: "openai/gpt-4o-mini",
  claude: "anthropic/claude-sonnet-4-5",
  gemini: "google/gemini-flash-1.5",
  openrouter: "openrouter/auto",
  local: "",
};

/** Build the provider config for a router sign-in (routes to the vendor). */
export function routedConfig(
  provider: ProviderId,
  apiKey: string,
): ProviderConfig {
  return {
    apiKey,
    baseUrl: provider === "openrouter" ? ROUTER_BASE_URL : undefined,
    model: ROUTED_MODELS[provider],
  };
}

/** True when the config is complete enough to make real calls. */
export function isConfigured(
  provider: ProviderId,
  config: ProviderConfig | undefined,
  hasSubscription: boolean = false,
): boolean {
  if (provider === "local") return Boolean(config?.baseUrl);
  if (hasSubscription) return true;
  return Boolean(config?.apiKey);
}

export async function* streamProvider(
  provider: ProviderId,
  config: ProviderConfig,
  system: string,
  messages: ChatMessage[],
  tools: AgentTool[] = [],
): AsyncGenerator<string> {
  const activeConfig = { ...config };

  // Fallback to global subscription if no specific API key is set for this provider
  if (provider !== "local" && !activeConfig.apiKey) {
    const subKey = await vaultGet("provider:openrouter");
    if (subKey) {
      activeConfig.apiKey = subKey;
      activeConfig.baseUrl = ROUTER_BASE_URL;
      activeConfig.model = config.model || ROUTED_MODELS[provider];
    }
  }

  const model = activeConfig.model || DEFAULT_MODELS[provider];
  // A base URL means OpenAI-compatible transport: the router (direct
  // sign-in for any vendor) or a Local AI server. Native vendor APIs are
  // only used when a raw key is supplied without a base URL.
  if (activeConfig.baseUrl) {
    yield* streamOpenAICompat(
      devUrl(activeConfig.baseUrl.replace(/\/$/, "")),
      activeConfig.apiKey,
      model,
      system,
      messages,
      tools,
    );
    return;
  }
  switch (provider) {
    case "claude":
      yield* streamAnthropic(activeConfig.apiKey!, model, system, messages);
      return;
    case "gemini":
      yield* streamGemini(activeConfig.apiKey!, model, system, messages);
      return;
    case "openrouter":
      yield* streamOpenAICompat(
        devUrl("https://openrouter.ai/api/v1"),
        activeConfig.apiKey,
        model,
        system,
        messages,
        tools,
      );
      return;
    case "chatgpt":
      yield* streamOpenAICompat(
        devUrl("https://api.openai.com/v1"),
        activeConfig.apiKey,
        model,
        system,
        messages,
        tools,
      );
      return;
    case "local":
      yield* streamOpenAICompat(
        activeConfig.baseUrl!.replace(/\/$/, ""),
        activeConfig.apiKey,
        model,
        system,
        messages,
        tools,
      );
      return;
  }
}

/** Reads an SSE response body and yields each `data:` payload. */
async function* sseData(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : null;
      if (data && data !== "[DONE]") yield data;
    }
  }
}

async function raiseForStatus(response: Response): Promise<void> {
  if (response.ok) return;
  let detail = "";
  try {
    const body = await response.json();
    detail = body?.error?.message ?? JSON.stringify(body);
  } catch {
    detail = response.statusText;
  }
  throw new Error(`Provider error (${response.status}): ${detail}`);
}

/** One accumulated tool call as it streams in fragments. */
interface PendingToolCall {
  id: string;
  name: string;
  args: string;
}

/**
 * OpenAI-compatible chat with an in-app tool-calling loop.
 *
 * Text deltas stream to the user as they arrive. When the model asks to call
 * a tool, the fragments are accumulated, the tool runs locally (Vault, HTTP
 * action), its result is fed back, and the model continues — until it
 * produces a final answer with no more tool calls. With no tools this is a
 * plain streaming chat, identical to before.
 */
async function* streamOpenAICompat(
  baseUrl: string,
  apiKey: string | undefined,
  model: string,
  system: string,
  messages: ChatMessage[],
  tools: AgentTool[] = [],
): AsyncGenerator<string> {
  const convo: Record<string, unknown>[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: convo,
        ...(tools.length ? { tools: tools.map((t) => t.schema) } : {}),
      }),
    });
    await raiseForStatus(response);

    let text = "";
    const pending = new Map<number, PendingToolCall>();
    for await (const data of sseData(response)) {
      let delta: {
        content?: string;
        tool_calls?: {
          index?: number;
          id?: string;
          function?: { name?: string; arguments?: string };
        }[];
      };
      try {
        delta = JSON.parse(data).choices?.[0]?.delta ?? {};
      } catch {
        continue; // keep-alive frame
      }
      if (delta.content) {
        text += delta.content;
        yield delta.content;
      }
      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const slot = pending.get(idx) ?? { id: "", name: "", args: "" };
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
        pending.set(idx, slot);
      }
    }

    // No tool calls → the streamed text is the final answer.
    if (pending.size === 0) return;

    // On the last allowed round, stop looping to avoid runaway tool use.
    if (round === MAX_TOOL_ROUNDS) return;

    const calls = [...pending.values()];
    convo.push({
      role: "assistant",
      content: text || null,
      tool_calls: calls.map((c, i) => ({
        id: c.id || `call_${round}_${i}`,
        type: "function",
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });
    for (const [i, call] of calls.entries()) {
      const tool = tools.find((t) => t.schema.function.name === call.name);
      let result: string;
      if (!tool) {
        result = `Error: unknown tool "${call.name}".`;
      } else {
        try {
          result = await tool.run(JSON.parse(call.args || "{}"));
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : e}`;
        }
      }
      convo.push({
        role: "tool",
        tool_call_id: call.id || `call_${round}_${i}`,
        content: result,
      });
    }
  }
}

async function* streamAnthropic(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const isOAuth = apiKey.startsWith("sk-ant-oauth0");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (isOAuth) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["anthropic-beta"] = "oauth-2025-04-20";
  } else {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetch(devUrl("https://api.anthropic.com/v1/messages"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  await raiseForStatus(response);
  for await (const data of sseData(response)) {
    try {
      const event = JSON.parse(data);
      if (event.type === "content_block_delta" && event.delta?.text) {
        yield event.delta.text;
      }
    } catch {
      /* ignore */
    }
  }
}

async function* streamGemini(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const url = devUrl(
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${model}:streamGenerateContent?alt=sse`,
  );
  const isOAuth = apiKey.startsWith("ya29.");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (isOAuth) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["x-goog-api-key"] = apiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    }),
  });
  await raiseForStatus(response);
  for await (const data of sseData(response)) {
    try {
      const text =
        JSON.parse(data).candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) yield text;
    } catch {
      /* ignore */
    }
  }
}
