/** Local AI Router client. Chat never calls a vendor endpoint directly. */
import { waitForPopupCallback } from "./oauth";

export const AI_ROUTER_BASE_URL = "http://127.0.0.1:20128/v1";

export interface AiRouterModel {
  id: string;
  name: string;
  provider?: string;
}

export interface AiRouterConnection {
  id: string;
  provider: string;
  name?: string;
  isActive?: boolean;
  testStatus?: string;
  defaultModel?: string;
  lastError?: string;
  lastTestedAt?: string;
  credentialRef?: string;
}

export interface AiRouterProvider {
  id: string;
  name: string;
  oauth: boolean;
  oauthProvider?: string;
  apiKey: boolean;
}

export interface AiRouterOAuthTokens {
  accessToken?: string;
  apiKey?: string;
  refreshToken?: string;
  projectId?: string;
  expiresIn?: number;
  providerSpecificData?: Record<string, unknown>;
}

export interface CreateAiRouterConnection {
  id: string;
  provider: string;
  name?: string;
  authType: "subscription" | "api-key";
  credentialRef: string;
  defaultModel?: string;
}

function normalizeModels(payload: unknown): AiRouterModel[] {
  const value = payload as { data?: unknown[]; models?: unknown[] };
  const data = Array.isArray(payload) ? payload : value?.data ?? value?.models ?? [];
  return data
    .map((item) => {
      const model = item as { id?: unknown; name?: unknown; provider?: unknown; owned_by?: unknown };
      const id = typeof model.id === "string" ? model.id : "";
      return {
        id,
        name: typeof model.name === "string" ? model.name : id,
        provider: typeof model.provider === "string"
          ? model.provider
          : typeof model.owned_by === "string" ? model.owned_by : undefined,
      };
    })
    .filter((model) => model.id);
}

export async function getAiRouterModels(signal?: AbortSignal): Promise<AiRouterModel[]> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/models`, { signal });
  if (!response.ok) throw new Error(`AI Router is unavailable (${response.status})`);
  return normalizeModels(await response.json());
}

export async function getAiRouterConnections(signal?: AbortSignal): Promise<AiRouterConnection[]> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/providers`, { signal });
  if (!response.ok) throw new Error(`AI Router connections are unavailable (${response.status})`);
  const payload = (await response.json()) as { connections?: AiRouterConnection[] };
  return payload.connections ?? [];
}

export async function getAiRouterProviderCatalog(signal?: AbortSignal): Promise<AiRouterProvider[]> {
  const response = await fetch(`${AI_ROUTER_BASE_URL}/providers/catalog`, { signal });
  if (!response.ok) throw new Error(`AI Router provider catalog is unavailable (${response.status})`);
  const payload = (await response.json()) as { providers?: AiRouterProvider[] };
  return payload.providers ?? [];
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

/**
 * One browser-OAuth client for every authorization-code provider published by
 * the vendored AI Router Core. Provider-specific PKCE and token exchange live
 * in the Core, not in this UI.
 */
export async function signInWithAiRouterCore(provider: string): Promise<AiRouterOAuthTokens> {
  const redirectUri = `${window.location.origin}/callback`;
  const authorizeResponse = await fetch(`${AI_ROUTER_BASE_URL}/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, redirectUri }),
  });
  const authorize = (await authorizeResponse.json()) as {
    authUrl?: string | null;
    state?: string;
    codeVerifier?: string;
    redirectUri?: string;
    flowType?: string;
    error?: string;
  };
  if (!authorizeResponse.ok || !authorize.authUrl || !authorize.state || !authorize.redirectUri) {
    throw new Error(authorize.error || `AI Router OAuth requires ${authorize.flowType || "a different sign-in flow"} for this provider.`);
  }
  const callback = await waitForPopupCallback(authorize.authUrl, authorize.state);
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
