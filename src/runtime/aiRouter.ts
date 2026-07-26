/** Local AI Router client. Chat never calls a vendor endpoint directly. */
import { signIn, waitForPopupCallback } from "./oauth";
import { inDesktopShell } from "./proxy";

export const AI_ROUTER_BASE_URL = "http://127.0.0.1:20128/v1";

export interface AiRouterModel {
  id: string;
  name: string;
  provider?: string;
  kind?: "model" | "pack";
  models?: string[];
  strategy?: "fallback" | "round-robin";
  connectionId?: string;
  accountLabel?: string;
}

export interface AiRouterPack {
  id: string;
  name: string;
  models: string[];
  strategy: "fallback" | "round-robin";
  stickyLimit?: number;
  autoSwitch?: boolean;
}

export interface AiRouterConnection {
  id: string;
  provider: string;
  name?: string;
  label?: string;
  email?: string;
  accountLabel?: string;
  priority?: number;
  isActive?: boolean;
  testStatus?: string;
  defaultModel?: string;
  lastError?: string;
  lastTestedAt?: string;
  credentialRef?: string;
  authType?: "subscription" | "api-key";
}

export interface AiRouterProvider {
  id: string;
  name: string;
  oauth: boolean;
  oauthProvider?: string;
  apiKey: boolean;
  cookie?: boolean;
  authHint?: string;
}

export interface AiRouterOAuthTokens {
  accessToken?: string;
  apiKey?: string;
  refreshToken?: string;
  idToken?: string;
  email?: string;
  projectId?: string;
  expiresIn?: number;
  lastRefreshAt?: string;
  scope?: string;
  providerSpecificData?: Record<string, unknown>;
}

interface AiRouterDeviceCode {
  device_code?: string;
  deviceCode?: string;
  user_code?: string;
  userCode?: string;
  verification_uri?: string;
  verificationUri?: string;
  verification_uri_complete?: string;
  verificationUriComplete?: string;
  interval?: number;
  expires_in?: number;
  expiresIn?: number;
}

export interface CreateAiRouterConnection {
  id: string;
  provider: string;
  name?: string;
  label?: string;
  email?: string;
  accountLabel?: string;
  priority?: number;
  authType: "subscription" | "api-key";
  credentialRef: string;
  defaultModel?: string;
}

function normalizeModels(payload: unknown): AiRouterModel[] {
  const value = payload as { data?: unknown[]; models?: unknown[] };
  const data = Array.isArray(payload) ? payload : value?.data ?? value?.models ?? [];
  return data
    .map((item) => {
      const model = item as { id?: unknown; name?: unknown; provider?: unknown; owned_by?: unknown; kind?: unknown; models?: unknown; strategy?: unknown; connectionId?: unknown; accountLabel?: unknown };
      const id = typeof model.id === "string" ? model.id : "";
      return {
        id,
        name: typeof model.name === "string" ? model.name : id,
        provider: typeof model.provider === "string"
          ? model.provider
          : typeof model.owned_by === "string" ? model.owned_by : undefined,
        kind: model.kind === "pack" ? "pack" as const : "model" as const,
        models: Array.isArray(model.models) ? model.models.filter((entry): entry is string => typeof entry === "string") : undefined,
        strategy: model.strategy === "round-robin"
          ? "round-robin" as const
          : model.strategy === "fallback" ? "fallback" as const : undefined,
        connectionId: typeof model.connectionId === "string" ? model.connectionId : undefined,
        accountLabel: typeof model.accountLabel === "string" ? model.accountLabel : undefined,
      };
    })
    .filter((model) => model.id);
}

import { vaultGet, vaultSet } from "./vault";

const PACKS_VAULT_KEY = "ai_router_custom_packs_v1";

async function persistPacksToVault(packs: AiRouterPack[]): Promise<void> {
  try {
    await vaultSet(PACKS_VAULT_KEY, JSON.stringify(packs));
  } catch {
    /* ignore vault write errors */
  }
}

export async function syncSavedPacksFromVault(): Promise<void> {
  try {
    const raw = await vaultGet(PACKS_VAULT_KEY);
    if (!raw) return;
    const savedPacks = JSON.parse(raw) as AiRouterPack[];
    if (!Array.isArray(savedPacks) || savedPacks.length === 0) return;

    const currentPacks = await getAiRouterPacks().catch(() => []);
    const currentPackIds = new Set(currentPacks.map((p) => p.id));

    for (const pack of savedPacks) {
      if (!currentPackIds.has(pack.id)) {
        await fetch(`${AI_ROUTER_BASE_URL}/packs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pack),
        }).catch(() => null);
      }
    }
  } catch {
    /* ignore restore errors */
  }
}

export async function getAiRouterPacks(signal?: AbortSignal): Promise<AiRouterPack[]> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/packs`, { signal });
  if (!response.ok) throw new Error(`AI Router packs are unavailable (${response.status})`);
  const payload = (await response.json()) as { packs?: AiRouterPack[] };
  return payload.packs ?? [];
}

export async function saveAiRouterPack(input: Omit<AiRouterPack, "id"> & { id?: string }): Promise<AiRouterPack> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/packs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as { pack?: AiRouterPack; error?: string };
  if (!response.ok || !payload.pack) throw new Error(payload.error || `AI Router could not save the pack (${response.status})`);

  // Persist updated packs list to Vault
  const latestPacks = await getAiRouterPacks().catch(() => [payload.pack!]);
  void persistPacksToVault(latestPacks);

  return payload.pack;
}

export async function deleteAiRouterPack(id: string): Promise<void> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/packs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (response.status !== 204) throw new Error(`AI Router could not delete the pack (${response.status})`);

  // Persist updated packs list to Vault
  const latestPacks = await getAiRouterPacks().catch(() => []);
  void persistPacksToVault(latestPacks);
}

export async function getAiRouterModels(signal?: AbortSignal): Promise<AiRouterModel[]> {
  await syncSavedPacksFromVault().catch(() => null);
  const response = await fetch(`${AI_ROUTER_BASE_URL}/models`, { signal });
  if (!response.ok) throw new Error(`AI Router is unavailable (${response.status})`);
  return normalizeModels(await response.json());
}

export async function getAiRouterConnections(signal?: AbortSignal): Promise<AiRouterConnection[]> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(`${AI_ROUTER_BASE_URL}/providers`, { signal });
      if (!response.ok) throw new Error(`AI Router connections are unavailable (${response.status})`);
      const payload = (await response.json()) as { connections?: AiRouterConnection[] };
      return payload.connections ?? [];
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      await new Promise((res) => setTimeout(res, 350));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function getAiRouterProviderCatalog(signal?: AbortSignal): Promise<AiRouterProvider[]> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(`${AI_ROUTER_BASE_URL}/providers/catalog`, { signal });
      if (!response.ok) throw new Error(`AI Router provider catalog is unavailable (${response.status})`);
      const payload = (await response.json()) as { providers?: AiRouterProvider[] };
      return payload.providers ?? [];
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      await new Promise((res) => setTimeout(res, 350));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function saveAiRouterConnection(connection: CreateAiRouterConnection): Promise<AiRouterConnection> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/providers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(connection),
  });
  if (!response.ok) throw new Error(`AI Router could not save the connection (${response.status})`);
  const payload = (await response.json()) as { connection?: AiRouterConnection };
  if (!payload.connection) throw new Error("AI Router did not return the saved connection");
  return payload.connection;
}

export async function testAiRouterConnection(id: string): Promise<AiRouterConnection> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/providers/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
  const payload = (await response.json()) as { connection?: AiRouterConnection; error?: string };
  if (!response.ok || !payload.connection) {
    throw new Error(payload.error || `AI Router connection test failed (${response.status})`);
  }
  return payload.connection;
}

export async function deleteAiRouterConnection(id: string): Promise<void> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (response.status !== 204) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `AI Router could not reset the connection (${response.status})`);
  }
}

export async function toggleAiRouterConnection(id: string, isActive: boolean): Promise<AiRouterConnection> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/providers/${encodeURIComponent(id)}/toggle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `AI Router could not toggle the connection (${response.status})`);
  }
  const payload = (await response.json()) as { connection?: AiRouterConnection };
  if (!payload.connection) throw new Error("AI Router did not return updated connection");
  return payload.connection;
}

/**
 * One browser-OAuth client for every authorization-code provider published by
 * the vendored AI Router Core. Provider-specific PKCE and token exchange live
 * in the Core, not in this UI.
 */
export async function signInWithAiRouterCore(
  provider: string,
  onManualAuthUrl?: (url: string) => void,
): Promise<AiRouterOAuthTokens> {
  if (provider === "openrouter") {
    const result = await signIn("openrouter", "settings", onManualAuthUrl);
    if (!result?.apiKey) throw new Error("OpenRouter sign-in returned no user key.");
    return { apiKey: result.apiKey };
  }
  // Google only accepts the loopback callback registered by the inherited
  // Antigravity OAuth client. The Tauri WebView origin is an internal app
  // transport origin and must never be sent to an OAuth provider.
  const redirectUri = provider === "antigravity"
    ? "http://localhost:1420/callback"
    : `${window.location.origin}/callback`;
  const authorizeResponse = await fetch(`${AI_ROUTER_BASE_URL}/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, redirectUri }),
  });
  const authorize = (await authorizeResponse.json()) as {
    authUrl?: string | null;
    state?: string;
    codeVerifier?: string;
    codeChallenge?: string;
    redirectUri?: string;
    flowType?: string;
    error?: string;
  };
  if (authorize.flowType === "device_code") {
    const deviceResponse = await fetch(`${AI_ROUTER_BASE_URL}/oauth/device/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        codeChallenge: authorize.codeChallenge || "",
      }),
    });
    const devicePayload = (await deviceResponse.json()) as { device?: AiRouterDeviceCode; error?: string };
    const device = devicePayload.device;
    if (!deviceResponse.ok || !device) {
      throw new Error(devicePayload.error || `AI Router device authorization failed (${deviceResponse.status})`);
    }
    const deviceCode = device.device_code || device.deviceCode;
    if (!deviceCode) throw new Error("AI Router device authorization returned no device code.");
    const verificationUrl = device.verification_uri_complete
      || device.verificationUriComplete
      || device.verification_uri
      || device.verificationUri;
    if (verificationUrl) {
      onManualAuthUrl?.(verificationUrl);
      window.open(verificationUrl, "v_assistant_ai_router_device", "width=720,height=760");
    }
    const intervalMs = Math.max(2, Number(device.interval || 5)) * 1000;
    const expiresInMs = Math.max(60, Number(device.expires_in || device.expiresIn || 300)) * 1000;
    const deadline = Date.now() + expiresInMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
      const pollResponse = await fetch(`${AI_ROUTER_BASE_URL}/oauth/device/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          deviceCode,
          codeVerifier: authorize.codeVerifier || "",
          extraData: device,
        }),
      });
      const poll = (await pollResponse.json()) as {
        success?: boolean;
        tokens?: AiRouterOAuthTokens;
        pending?: boolean;
        error?: string;
        errorDescription?: string;
      };
      if (poll.success && poll.tokens) return poll.tokens;
      if (!poll.pending && poll.error !== "authorization_pending" && poll.error !== "slow_down") {
        throw new Error(poll.errorDescription || poll.error || `AI Router device authorization failed (${pollResponse.status})`);
      }
    }
    throw new Error("Device authorization timed out before the account was approved.");
  }
  if (!authorizeResponse.ok || !authorize.authUrl || !authorize.state || !authorize.redirectUri) {
    throw new Error(authorize.error || `AI Router OAuth requires ${authorize.flowType || "a different sign-in flow"} for this provider.`);
  }
  const manualCallback = provider === "antigravity" || provider === "claude" || provider === "codex" || provider === "xai";
  onManualAuthUrl?.(authorize.authUrl);
  const callback = await waitForPopupCallback(authorize.authUrl, authorize.state, manualCallback);
  const code = callback.code || callback.token;
  if (!code) throw new Error("OAuth callback did not contain an authorization code.");
  const exchangeResponse = await fetch(`${AI_ROUTER_BASE_URL}/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      code,
      redirectUri: authorize.redirectUri,
      codeVerifier: authorize.codeVerifier || "",
      state: authorize.state,
    }),
  });
  const exchange = (await exchangeResponse.json()) as { tokens?: AiRouterOAuthTokens; error?: string };
  if (!exchangeResponse.ok || !exchange.tokens) {
    throw new Error(exchange.error || `AI Router OAuth token exchange failed (${exchangeResponse.status})`);
  }
  return exchange.tokens;
}

export async function exchangeAiRouterOAuthCallbackUrl(
  provider: string,
  fullCallbackUrl: string
): Promise<AiRouterOAuthTokens> {
  let urlObj: URL;
  try {
    urlObj = new URL(fullCallbackUrl.trim());
  } catch {
    throw new Error("URL Callback không hợp lệ. Vui lòng dán toàn bộ đường dẫn redirect (http://localhost:1420/callback?...).");
  }

  const code = urlObj.searchParams.get("code") || urlObj.searchParams.get("token");
  const state = urlObj.searchParams.get("state") || "";

  if (!code) {
    throw new Error("Không tìm thấy tham số 'code' hoặc 'token' trong URL callback.");
  }

  const redirectUri = provider === "antigravity"
    ? "http://localhost:1420/callback"
    : `${window.location.origin}/callback`;

  const exchangeResponse = await fetch(`${AI_ROUTER_BASE_URL}/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      code,
      redirectUri,
      state,
    }),
  });

  const exchange = (await exchangeResponse.json()) as { tokens?: AiRouterOAuthTokens; error?: string };
  if (!exchangeResponse.ok || !exchange.tokens) {
    throw new Error(exchange.error || `Xác thực OAuth thất bại (${exchangeResponse.status})`);
  }
  return exchange.tokens;
}

export async function captureGrokWebSsoCookie(): Promise<string> {
  if (!inDesktopShell()) {
    window.open("https://grok.com", "v_assistant_grok_web", "width=980,height=760");
    throw new Error("Automatic Grok cookie capture requires the V Assistant desktop app. In this web preview, paste the sso cookie manually.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<string>("capture_grok_sso_cookie");
}
