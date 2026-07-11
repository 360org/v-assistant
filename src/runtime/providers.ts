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

export interface ProviderConfig {
  apiKey?: string;
  /** OpenAI-compatible base URL — used by Local AI (Ollama, LM Studio). */
  baseUrl?: string;
  /** Model override; each provider has a sensible default. */
  model?: string;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  chatgpt: "gpt-4o-mini",
  claude: "claude-sonnet-5",
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
  claude: "anthropic/claude-3.5-sonnet",
  gemini: "google/gemini-2.0-flash-001",
  openrouter: "openrouter/auto",
  local: "",
};

/** Build the provider config for a router sign-in (routes to the vendor). */
export function routedConfig(
  provider: ProviderId,
  apiKey: string,
): ProviderConfig {
  return { apiKey, baseUrl: ROUTER_BASE_URL, model: ROUTED_MODELS[provider] };
}

/** True when the config is complete enough to make real calls. */
export function isConfigured(
  provider: ProviderId,
  config: ProviderConfig | undefined,
): boolean {
  if (!config) return false;
  if (provider === "local") return Boolean(config.baseUrl);
  return Boolean(config.apiKey);
}

export async function* streamProvider(
  provider: ProviderId,
  config: ProviderConfig,
  system: string,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const model = config.model || DEFAULT_MODELS[provider];
  // A base URL means OpenAI-compatible transport: the router (direct
  // sign-in for any vendor) or a Local AI server. Native vendor APIs are
  // only used when a raw key is supplied without a base URL.
  if (config.baseUrl) {
    yield* streamOpenAICompat(
      config.baseUrl.replace(/\/$/, ""),
      config.apiKey,
      model,
      system,
      messages,
    );
    return;
  }
  switch (provider) {
    case "claude":
      yield* streamAnthropic(config.apiKey!, model, system, messages);
      return;
    case "gemini":
      yield* streamGemini(config.apiKey!, model, system, messages);
      return;
    case "openrouter":
      yield* streamOpenAICompat(
        "https://openrouter.ai/api/v1",
        config.apiKey,
        model,
        system,
        messages,
      );
      return;
    case "chatgpt":
      yield* streamOpenAICompat(
        "https://api.openai.com/v1",
        config.apiKey,
        model,
        system,
        messages,
      );
      return;
    case "local":
      yield* streamOpenAICompat(
        config.baseUrl!.replace(/\/$/, ""),
        config.apiKey,
        model,
        system,
        messages,
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

async function* streamOpenAICompat(
  baseUrl: string,
  apiKey: string | undefined,
  model: string,
  system: string,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  await raiseForStatus(response);
  for await (const data of sseData(response)) {
    try {
      const delta = JSON.parse(data).choices?.[0]?.delta?.content;
      if (delta) yield delta;
    } catch {
      /* ignore keep-alive frames */
    }
  }
}

async function* streamAnthropic(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
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
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${model}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
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
