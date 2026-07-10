/**
 * Direct sign-in (OAuth) with AI providers — no API key pasting.
 *
 * OpenRouter implements public PKCE OAuth for third-party apps (no client
 * registration needed): we redirect to openrouter.ai/auth with a code
 * challenge, the user approves, and we exchange the returned code for a
 * user-scoped key. That one login unlocks GPT, Claude, Gemini and hundreds
 * of models. Native ChatGPT/Claude/Gemini sign-in plugs into the same flow
 * here once those vendors issue us OAuth client credentials.
 */

import type { ProviderId } from "@/lib/catalog";

const PENDING_KEY = "v-assistant-oauth-pending";

export interface OAuthReturn {
  provider: ProviderId;
  apiKey: string;
  context: "onboarding" | "settings";
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

/** Kick off the OpenRouter PKCE login: leaves the page. */
export async function startOpenRouterLogin(
  context: OAuthReturn["context"],
): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ provider: "openrouter", verifier, context }),
  );
  const challenge = await s256(verifier);
  const callback = window.location.origin + window.location.pathname;
  const url =
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  window.location.assign(url);
}

/**
 * Call on app start: if the URL carries an OAuth code and a login is
 * pending, exchange it for a key. Returns null when this is a normal load.
 */
export async function completeOAuthReturn(): Promise<OAuthReturn | null> {
  const code = new URLSearchParams(window.location.search).get("code");
  const pendingRaw = localStorage.getItem(PENDING_KEY);
  if (!code || !pendingRaw) return null;
  localStorage.removeItem(PENDING_KEY);
  const pending = JSON.parse(pendingRaw) as {
    provider: ProviderId;
    verifier: string;
    context: OAuthReturn["context"];
  };

  const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: pending.verifier,
      code_challenge_method: "S256",
    }),
  });
  // Strip ?code=… so a reload doesn't retry the exchange.
  window.history.replaceState({}, "", window.location.pathname);
  if (!response.ok) {
    throw new Error(`Sign-in failed (HTTP ${response.status}). Please try again.`);
  }
  const { key } = (await response.json()) as { key: string };
  return { provider: pending.provider, apiKey: key, context: pending.context };
}
