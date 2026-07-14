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
const MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

export interface ProviderConfig {
  apiKey?: string;
  /** OpenAI-compatible base URL — used by Local AI (Ollama, LM Studio). */
  baseUrl?: string;
  /** Model override; each provider has a sensible default. */
  model?: string;
  /**
   * The apiKey is a vendor subscription OAuth token (not a raw API key), so
   * inference must use `Authorization: Bearer` + the vendor's OAuth beta
   * header instead of the normal key header. Set by subscription sign-in.
   */
  oauth?: boolean;
}

export type ProviderConfigs = Partial<Record<ProviderId, ProviderConfig>>;

/** Direct vendors are attempted in this order; OpenRouter is always last. */
export const RATE_LIMIT_FALLBACK_ORDER: readonly ProviderId[] = [
  "claude",
  "chatgpt",
  "gemini",
  "openrouter",
];

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Provider error (${status}): ${detail}`);
    this.name = "ProviderHttpError";
  }
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof ProviderHttpError) {
    return error.status === 429 || error.status === 529;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /(?:^|\D)(?:429|529)(?:\D|$)/.test(message);
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

/**
 * Native model each vendor subscription sign-in talks to — a real vendor
 * model id (no "vendor/" prefix), so requests go straight to the vendor's
 * own API with the subscription OAuth token rather than through the router.
 */
export const SUBSCRIPTION_MODELS: Record<ProviderId, string> = {
  chatgpt: "gpt-4o",
  claude: "claude-sonnet-5",
  gemini: "gemini-2.5-flash",
  openrouter: "openrouter/auto",
  local: "",
};

/**
 * Config for a "Continue with <vendor>" subscription sign-in.
 *  - OpenRouter → the router key (one login → every model).
 *  - Claude / Gemini → the vendor's own subscription OAuth token, used
 *    natively (Bearer + OAuth beta header) against the vendor API.
 *
 * No model is pinned here on purpose: a pinned id is persisted forever and goes
 * stale when the vendor retires it (that is how a saved `claude-sonnet-4-…`
 * kept producing 404s). The model is resolved per request from
 * SUBSCRIPTION_MODELS instead, so updating that map is enough. The user can
 * still override it under Advanced options.
 */
export function loginConfig(
  provider: ProviderId,
  apiKey: string,
): ProviderConfig {
  if (provider === "openrouter") return routedConfig(provider, apiKey);
  return { apiKey, oauth: true };
}

/** The model a config resolves to when the user has not overridden it. */
export function defaultModelFor(
  provider: ProviderId,
  config: ProviderConfig | undefined,
): string {
  if (config?.oauth) return SUBSCRIPTION_MODELS[provider] || DEFAULT_MODELS[provider];
  return DEFAULT_MODELS[provider];
}

/** Models offered in the chat picker, per provider. Local AI has no fixed
 *  catalogue — the user names the model their own server serves. */
export const MODELS: Record<ProviderId, { id: string; name: string }[]> = {
  claude: [
    { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
    { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
  ],
  chatgpt: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o mini" },
  ],
  gemini: [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  ],
  openrouter: [
    { id: "openrouter/auto", name: "Auto (best available)" },
    { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  ],
  local: [],
};

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

  const model = activeConfig.model || defaultModelFor(provider, activeConfig);
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
      yield* streamAnthropic(activeConfig.apiKey!, model, system, messages, activeConfig.oauth);
      return;
    case "gemini":
      yield* streamGemini(activeConfig.apiKey!, model, system, messages, activeConfig.oauth);
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

/**
 * Sends one turn through the selected provider, then switches only when that
 * provider is rate limited before it has produced any visible response.
 */
export async function* streamProviderWithFallback(
  provider: ProviderId,
  configs: ProviderConfigs,
  system: string,
  messages: ChatMessage[],
  tools: AgentTool[] = [],
  options: { skipPrimary?: boolean } = {},
): AsyncGenerator<string> {
  const candidates = options.skipPrimary
    ? RATE_LIMIT_FALLBACK_ORDER.filter((candidate) => candidate !== provider)
    : [provider, ...RATE_LIMIT_FALLBACK_ORDER.filter((candidate) => candidate !== provider)];
  let firstRateLimitError: unknown;

  for (const candidate of candidates) {
    if (candidate === "local") continue;
    const config = configs[candidate];
    const hasGlobalOpenRouterKey =
      candidate === "openrouter" && Boolean(await vaultGet("provider:openrouter"));
    if (!config?.apiKey && !hasGlobalOpenRouterKey) continue;

    let emitted = false;
    try {
      for await (const chunk of streamProvider(candidate, config ?? {}, system, messages, tools)) {
        emitted = true;
        yield chunk;
      }
      return;
    } catch (error) {
      // Do not splice replies from two vendors, or retry after a tool might
      // already have run. A 429 before output is safe to reroute.
      if (emitted || !isRateLimitError(error)) throw error;
      firstRateLimitError ??= error;
    }
  }

  throw firstRateLimitError ?? new Error("No configured provider is available for this request.");
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
  throw new ProviderHttpError(response.status, detail);
}

function retryAfterMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  return DEFAULT_RETRY_DELAY_MS * 2 ** attempt;
}

async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    const retryable = response.status === 429 || response.status === 529;
    if (!retryable || attempt === MAX_RATE_LIMIT_RETRIES) return response;

    await new Promise<void>((resolve) => setTimeout(resolve, retryAfterMs(response, attempt)));
  }
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
    const response = await fetchWithRateLimitRetry(`${baseUrl}/chat/completions`, {
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
  oauth = false,
): AsyncGenerator<string> {
  // Subscription OAuth token → Bearer + OAuth beta header; raw key → x-api-key.
  // The config flag is authoritative; the prefix check is a fallback for keys
  // rehydrated without the flag.
  // ponytail: header shape follows Anthropic's OAuth flow, but a Claude
  // subscription token is minted for Claude Code and the API may reject a
  // foreign system prompt — needs a live smoke test with a real token.
  const isOAuth = oauth || apiKey.startsWith("sk-ant-oat");
  const url = devUrl("https://api.anthropic.com/v1/messages");
  // A relative URL means devUrl rewrote it onto the dev proxy, so the request
  // leaves from the server, not the browser. Only announce direct browser
  // access when we really are the browser: the header makes Anthropic enforce
  // the org's CORS setting, and orgs with CORS disabled answer 401
  // ("CORS requests are not allowed for this Organization").
  const throughProxy = !url.startsWith("http");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    ...(throughProxy
      ? {}
      : { "anthropic-dangerous-direct-browser-access": "true" }),
  };
  if (isOAuth) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["anthropic-beta"] = "oauth-2025-04-20";
  } else {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetchWithRateLimitRetry(url, {
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
  oauth = false,
): AsyncGenerator<string> {
  const url = devUrl(
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${model}:streamGenerateContent?alt=sse`,
  );
  // ponytail: Google access tokens (ya29.…) authenticate as Bearer, but a
  // Gemini-CLI cloud-platform token targets the Code Assist API, not this
  // generativelanguage endpoint — needs a live smoke test with a real token.
  const isOAuth = oauth || apiKey.startsWith("ya29.");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (isOAuth) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["x-goog-api-key"] = apiKey;
  }

  const response = await fetchWithRateLimitRetry(url, {
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
