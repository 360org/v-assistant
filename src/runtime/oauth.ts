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

import { getProvider, type ProviderId } from "@/lib/catalog";

const PENDING_KEY = "v-assistant-oauth-pending";

/**
 * Demo build: the artifact/preview can't complete a real OAuth round-trip
 * (external redirect is blocked, storage is sandboxed). In demo mode the
 * sign-in simulates the vendor round-trip locally so the full login UX is
 * visible; the real desktop/hosted build does true OAuth.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO === "1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Storage that never throws (sandboxed webviews block localStorage). */
const safeStore = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* no persistence available */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* no-op */
    }
  },
};

export interface LoginResult {
  provider: ProviderId;
  apiKey: string;
}

/** True when running inside the Tauri desktop shell. */
function inDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Desktop sign-in via loopback redirect: the native side opens a localhost
 * listener and the system browser, the user logs in for real, the browser
 * redirects back to localhost, and we exchange the code for a key — all
 * without leaving the app.
 */
async function desktopLogin(provider: ProviderId): Promise<LoginResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  const port = await invoke<number>("oauth_listen");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = await s256(verifier);
  const callback = `http://127.0.0.1:${port}`;

  // Wait for the native loopback to report the redirect's code.
  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Sign-in timed out. Please try again.")),
      300_000,
    );
    void listen<string>("oauth-code", (event) => {
      clearTimeout(timeout);
      resolve(event.payload);
    });
    void listen<string>("oauth-error", (event) => {
      clearTimeout(timeout);
      reject(new Error(event.payload));
    });
  });

  const url =
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  await invoke("open_external", { url });

  const code = await codePromise;
  const key = await exchangeCode(code, verifier);
  return { provider, apiKey: key };
}

/**
 * Start direct sign-in with a provider.
 *  - Desktop shell → real loopback OAuth, resolves in place.
 *  - Demo build → simulated round-trip, resolves in place.
 *  - Web (hosted) → PKCE redirect that navigates away and resumes via
 *    `completeOAuthReturn`; returns null.
 */
export async function signIn(
  provider: ProviderId,
  context: OAuthReturn["context"],
): Promise<LoginResult | null> {
  if (DEMO_MODE) {
    await sleep(900); // "Redirecting to the provider…"
    return { provider, apiKey: "demo-key" };
  }
  if (inDesktopShell()) {
    return await desktopLogin(provider);
  }
  // Web: every direct sign-in goes through the router; the chosen vendor
  // just decides which models the account is pointed at.
  await startOpenRouterLogin(context, provider);
  return null; // navigated away
}

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

/**
 * Kick off the PKCE login through the router (leaves the page). `provider`
 * is the vendor the user picked ("Login with ChatGPT/Claude/Gemini") so the
 * app can route to that vendor's models after the one login.
 */
export async function startOpenRouterLogin(
  context: OAuthReturn["context"],
  provider: ProviderId = "openrouter",
): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  safeStore.set(
    PENDING_KEY,
    JSON.stringify({ provider, verifier, context }),
  );
  const challenge = await s256(verifier);
  const callback = window.location.origin + window.location.pathname;
  const url =
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  window.location.assign(url);
}

/** Exchange an authorization code + PKCE verifier for a user-scoped key. */
async function exchangeCode(code: string, verifier: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed (HTTP ${response.status}). Please try again.`);
  }
  const { key } = (await response.json()) as { key: string };
  return key;
}

/**
 * Call on app start: if the URL carries an OAuth code and a login is
 * pending, exchange it for a key. Returns null when this is a normal load.
 */
export async function completeOAuthReturn(): Promise<OAuthReturn | null> {
  const code = new URLSearchParams(window.location.search).get("code");
  const pendingRaw = safeStore.get(PENDING_KEY);
  if (!code || !pendingRaw) return null;
  safeStore.remove(PENDING_KEY);
  const pending = JSON.parse(pendingRaw) as {
    provider: ProviderId;
    verifier: string;
    context: OAuthReturn["context"];
  };
  // Strip ?code=… so a reload doesn't retry the exchange.
  window.history.replaceState({}, "", window.location.pathname);
  const key = await exchangeCode(code, pending.verifier);
  return { provider: pending.provider, apiKey: key, context: pending.context };
}

export interface VendorAccount {
  label: string;
  detail?: string;
}

/**
 * Fetch the signed-in account from the vendor so the app can create a local
 * user on first login — no separate sign-up. Best-effort: returns null if
 * the vendor has no readable profile for this key.
 */
export async function fetchVendorAccount(
  provider: ProviderId,
  apiKey: string,
): Promise<VendorAccount | null> {
  if (DEMO_MODE) {
    return { label: `Demo user · ${getProvider(provider).name}`, detail: "Preview account" };
  }
  try {
    // Direct sign-ins all use a router key, so the account lives at the
    // router regardless of which vendor button was clicked.
    if (provider !== "local") {
      const res = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return null;
      const { data } = (await res.json()) as {
        data?: { label?: string; limit?: number | null; usage?: number };
      };
      const label = data?.label?.trim() || "OpenRouter account";
      const detail =
        data?.limit != null
          ? `$${(data.limit - (data.usage ?? 0)).toFixed(2)} credit left`
          : undefined;
      return { label, detail };
    }
  } catch {
    /* fall through to null */
  }
  return null;
}
