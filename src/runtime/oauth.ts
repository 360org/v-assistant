/**
 * Direct sign-in (OAuth) with AI providers — popup-based flow.
 *
 * Pattern follows 9router (ai-router.vuahethong.com):
 *  1. Call /api/oauth/[provider]/authorize (server builds auth URL + PKCE)
 *     — or for simple providers, build URL client-side
 *  2. Open a popup pointing at the auth URL; redirect_uri = localhost:1420/callback
 *  3. The /callback page relays code+state back via postMessage / BroadcastChannel
 *  4. Exchange the code server-side (or via proxy) for an access token
 *  5. Resolve with { provider, apiKey }
 *
 * Fallback (popup blocked / remote host):
 *  - Show the auth URL for the user to open manually
 *  - Accept a pasted callback URL → parse code from it → exchange
 *
 * Desktop Tauri shell still uses the native loopback listener (unchanged).
 */

import { getProvider, type ProviderId } from "@/lib/catalog";
import { devUrl, inDesktopShell } from "./proxy";

const PENDING_KEY = "v-assistant-oauth-pending";
const CALLBACK_KEY = "v_assistant_oauth_callback";

/**
 * Demo build: the artifact/preview can't complete a real OAuth round-trip.
 * In demo mode the sign-in simulates the vendor round-trip locally.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO === "1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Storage that never throws (sandboxed webviews block localStorage). */
const safeStore = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* no persistence */ }
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* no-op */ }
  },
};

export interface LoginResult {
  provider: ProviderId;
  apiKey: string;
}

export interface OAuthReturn {
  provider: ProviderId;
  apiKey: string;
  context: "onboarding" | "settings";
}

// ─── PKCE helpers ────────────────────────────────────────────────────────────

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/**
 * PKCE verifier / CSRF state, sized exactly like 9router's `generatePKCE`
 * (32 random bytes → 43 base64url chars each). The vendor OAuth clients are
 * picky: a shorter state made claude.ai reject the request with "Invalid
 * request format", so keep these byte counts in sync with 9router.
 */
const PKCE_BYTES = 32;

function randomBase64url(bytes = PKCE_BYTES): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ─── OAuth configs (static) ───────────────────────────────────────────────────

// Subscription sign-in với client OAuth của CLI chính chủ (Claude Code /
// Gemini CLI) — quyết định sản phẩm của PO ngày 2026-07-14: user đăng nhập
// bằng subscription sẵn có, không dán API key (idea.md §A, SPEC §1).
// ponytail: client không phải do vendor cấp cho V-Assistant — vendor có thể
// thu hồi/chặn bất kỳ lúc nào; hướng nâng cấp là chuyển OAuth về 9router
// server-side (CHECKLIST §4.2).
export const OAUTH_CONFIGS = {
  openrouter: {
    authorizeUrl: "https://openrouter.ai/auth",
    tokenUrl: "https://openrouter.ai/api/v1/auth/keys",
    usePkce: true,
    usePopup: true,   // openrouter uses callback_url param, not redirect_uri
  },
  claude: {
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://api.anthropic.com/v1/oauth/token",
    scopes: ["org:create_api_key", "user:profile", "user:inference"],
    usePkce: true,
    usePopup: true,
    // Claude token exchange uses JSON body (not form-urlencoded) — per 9router
    exchangeContentType: "application/json" as const,
  },
  gemini: {
    clientId: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
    // Gemini CLI's public installed-app credential (published in Google's own
    // gemini-cli repo) — not a confidential secret by design.
    clientSecret: "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",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      // Required by Gemini Developer API when authenticating with an OAuth
      // bearer token rather than an AI Studio API key.
      "https://www.googleapis.com/auth/generative-language.retriever",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    usePkce: false,   // Gemini standard OAuth, no PKCE — per 9router gemini.js
    usePopup: true,
  },
} as const;

// ─── Callback URL helper ──────────────────────────────────────────────────────

/**
 * The redirect_uri per provider. It is NOT free-form: each vendor OAuth client
 * only accepts redirect URIs registered against it.
 *
 *  - OpenRouter: public PKCE, no client registration → the app's own /callback
 *    route (main.tsx) works, and the popup relays the code back automatically.
 *    This is the only true 1-click flow.
 *
 *  - Claude: the Claude Code client whitelists only a fixed set of loopback
 *    URIs (`http://localhost:443/callback` is the one 9router uses and the one
 *    proven to work here). Any other port — including the app's own 1420 — is
 *    rejected by claude.ai with "Authorization failed / Invalid request
 *    format". Nothing listens on 443, so after the user approves, the browser
 *    lands on an unreachable page whose address bar carries `?code=…`; the user
 *    pastes that URL back into the app (see ProviderConnect's manual fallback).
 *
 *  - Gemini: Google installed-app clients accept any loopback port, so the
 *    app's own /callback works and the popup relays automatically.
 *
 * ponytail: 443 is a magic number inherited from the vendor's whitelist, not a
 * choice. Hard-coding it is the only thing that works today; the durable fix is
 * to move vendor OAuth server-side into 9router (CHECKLIST §4.2).
 */
const CLAUDE_REDIRECT_URI = "http://localhost:443/callback";

function callbackUrl(provider: ProviderId): string {
  if (provider === "claude") return CLAUDE_REDIRECT_URI;
  return `${window.location.origin}/callback`;
}

/** True when the vendor redirects somewhere the app cannot listen on, so the
 *  user has to paste the callback URL back in by hand. */
export function needsManualCallback(provider: ProviderId): boolean {
  return provider === "claude";
}

// ─── Auth URL builders ────────────────────────────────────────────────────────

async function buildAuthUrl(
  provider: ProviderId,
  redirect: string,
  verifier: string,
  state: string,
): Promise<string> {
  if (provider === "openrouter") {
    const challenge = await s256(verifier);
    // OpenRouter uses callback_url (not redirect_uri) and its own PKCE variant
    return (
      `https://openrouter.ai/auth?callback_url=${encodeURIComponent(redirect)}` +
      `&code_challenge=${challenge}&code_challenge_method=S256`
    );
  }

  if (provider === "claude") {
    const challenge = await s256(verifier);
    const conf = OAUTH_CONFIGS.claude;
    const params = new URLSearchParams({
      code: "true",
      client_id: conf.clientId,
      response_type: "code",
      redirect_uri: redirect,
      scope: conf.scopes.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });
    return `${conf.authorizeUrl}?${params.toString()}`;
  }

  if (provider === "gemini") {
    const conf = OAUTH_CONFIGS.gemini;
    // Gemini uses standard OAuth2 — no PKCE (per 9router gemini.js)
    const params = new URLSearchParams({
      client_id: conf.clientId,
      response_type: "code",
      redirect_uri: redirect,
      scope: conf.scopes.join(" "),
      state,
      access_type: "offline",
      prompt: "consent",
    });
    return `${conf.authorizeUrl}?${params.toString()}`;
  }

  throw new Error(`Provider ${provider} does not support OAuth`);
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function exchangeCode(
  provider: ProviderId,
  code: string,
  verifier: string,
  redirect: string,
  state: string,
): Promise<string> {
  if (provider === "openrouter") {
    const response = await fetch(devUrl("https://openrouter.ai/api/v1/auth/keys"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: "S256",
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter sign-in failed (HTTP ${response.status}): ${text}`);
    }
    const { key } = (await response.json()) as { key: string };
    return key;
  }

  if (provider === "claude") {
    // The returned code may carry state after '#' (per 9router claude.js).
    let authCode = code;
    let codeState = "";
    if (authCode.includes("#")) {
      [authCode, codeState = ""] = authCode.split("#");
    }
    const response = await fetch(devUrl("https://api.anthropic.com/v1/oauth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        code: authCode,
        state: codeState || state,
        grant_type: "authorization_code",
        client_id: OAUTH_CONFIGS.claude.clientId,
        redirect_uri: redirect,
        code_verifier: verifier,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude sign-in failed (HTTP ${response.status}): ${text}`);
    }
    const data = await response.json();
    const token = data.access_token || data.refresh_token;
    if (!token) throw new Error("No access_token in Claude OAuth response.");
    return token;
  }

  if (provider === "gemini") {
    const conf = OAUTH_CONFIGS.gemini;
    const response = await fetch(devUrl("https://oauth2.googleapis.com/token"), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: conf.clientId,
        client_secret: conf.clientSecret,
        code,
        redirect_uri: redirect,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini sign-in failed (HTTP ${response.status}): ${text}`);
    }
    const data = await response.json();
    const token = data.access_token || data.refresh_token;
    if (!token) throw new Error("No access_token in Gemini OAuth response.");
    return token;
  }

  throw new Error(`Exchange not implemented for provider: ${provider}`);
}

// ─── Popup + listener ─────────────────────────────────────────────────────────

interface CallbackPayload {
  code?: string | null;
  token?: string | null;
  state?: string | null;
  error?: string | null;
  errorDescription?: string | null;
  fullUrl?: string;
}

/**
 * Open OAuth popup and wait for callback via postMessage / BroadcastChannel / localStorage.
 * Resolves with the OAuth code (or rejects on error / timeout).
 *
 * `manualCallback` providers (Claude) redirect to a port nothing listens on, so
 * the popup necessarily ends on a failed page the user closes after copying the
 * URL. Closing it there is the normal path, not an error — so we must not reject
 * on popup close, or the pasted URL arrives after nobody is listening.
 */
function waitForPopupCallback(
  authUrl: string,
  expectedState: string,
  manualCallback = false,
): Promise<CallbackPayload> {
  return new Promise((resolve, reject) => {
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    let settled = false;

    const popup = window.open(authUrl, "v_assistant_oauth_popup", "width=600,height=700");

    function settle(value: CallbackPayload | Error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (value instanceof Error) reject(value);
      else resolve(value);
    }

    function handleData(data: CallbackPayload) {
      if (data.error) {
        settle(new Error(data.errorDescription || data.error));
        return;
      }
      if (data.code || data.token) {
        // Verify state for CSRF protection
        if (expectedState && data.state && data.state !== expectedState) {
          settle(new Error("OAuth state mismatch — possible CSRF. Please try again."));
          return;
        }
        settle(data);
      }
    }

    // Method 1: postMessage from popup
    const msgHandler = (event: MessageEvent) => {
      const isLocal = event.origin.includes("localhost") || event.origin.includes("127.0.0.1");
      const isSameOrigin = event.origin === window.location.origin;
      if (!isLocal && !isSameOrigin) return;
      if (event.data?.type === "oauth_callback") handleData(event.data.data as CallbackPayload);
    };
    window.addEventListener("message", msgHandler);

    // Method 2: BroadcastChannel
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("v_assistant_oauth");
      channel.onmessage = (e) => handleData(e.data as CallbackPayload);
    } catch { /* not supported */ }

    // Method 3: localStorage storage event
    const storageHandler = (event: StorageEvent) => {
      if (event.key === CALLBACK_KEY && event.newValue) {
        try {
          const data = JSON.parse(event.newValue) as CallbackPayload;
          handleData(data);
          safeStore.remove(CALLBACK_KEY);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", storageHandler);

    // Check if callback already in localStorage (race condition)
    const existing = safeStore.get(CALLBACK_KEY);
    if (existing) {
      try {
        const data = JSON.parse(existing) as CallbackPayload & { timestamp?: number };
        if (data.timestamp && Date.now() - data.timestamp < 30_000) {
          safeStore.remove(CALLBACK_KEY);
          handleData(data);
        }
      } catch { /* ignore */ }
    }

    // Detect popup closed without completing. Skipped for manual-callback
    // providers, where closing the popup is part of the normal flow and the
    // code still arrives later via the pasted URL.
    const pollInterval = manualCallback
      ? undefined
      : setInterval(() => {
          if (popup && popup.closed && !settled) {
            settle(new Error("Sign-in window was closed before completing. Please try again."));
          }
        }, 1000);

    // Timeout
    const timeout = setTimeout(() => {
      settle(new Error("Sign-in timed out after 5 minutes. Please try again."));
    }, TIMEOUT_MS);

    function cleanup() {
      if (pollInterval !== undefined) clearInterval(pollInterval);
      clearTimeout(timeout);
      window.removeEventListener("message", msgHandler);
      window.removeEventListener("storage", storageHandler);
      channel?.close();
    }
  });
}

// ─── Desktop loopback OAuth (Tauri) ──────────────────────────────────────────

async function desktopLogin(provider: ProviderId): Promise<LoginResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  const port = await invoke<number>("oauth_listen");
  const verifier = randomBase64url();
  const state = randomBase64url();
  // Must match the loopback redirect the vendor OAuth clients whitelist:
  // `http://localhost:<port>/callback` (host `localhost`, path `/callback`).
  // Using 127.0.0.1 or omitting /callback makes claude.ai reject the request
  // as "Invalid request format" (matches 9router's proven flow).
  const redirect = `http://localhost:${port}/callback`;

  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Sign-in timed out. Please try again.")),
      300_000,
    );
    void listen<string>("oauth-code", (event) => { clearTimeout(timeout); resolve(event.payload); });
    void listen<string>("oauth-error", (event) => { clearTimeout(timeout); reject(new Error(event.payload)); });
  });

  if (!(provider in OAUTH_CONFIGS)) {
    throw new Error(`Direct sign-in for ${provider} is not available. Use another provider or paste an API key.`);
  }

  const url = await buildAuthUrl(provider, redirect, verifier, state);
  await invoke("open_external", { url });

  const code = await codePromise;
  const key = await exchangeCode(provider, code, verifier, redirect, state);
  return { provider, apiKey: key };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Open a URL in the user's real browser. */
export async function openExternal(url: string): Promise<void> {
  if (inDesktopShell()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Start direct sign-in with a provider.
 *  - Desktop shell → real loopback OAuth, resolves in place.
 *  - Demo build → simulated round-trip.
 *  - Web → popup + BroadcastChannel/postMessage flow.
 *
 * @param onAuthUrl - Called with the auth URL before the popup opens.
 *   Use this to show a manual "copy URL / paste callback" fallback.
 */
export async function signIn(
  provider: ProviderId,
  _context: OAuthReturn["context"],
  onAuthUrl?: (url: string) => void,
): Promise<LoginResult | null> {
  if (DEMO_MODE) {
    await sleep(900);
    return { provider, apiKey: "demo-key" };
  }

  if (!(provider in OAUTH_CONFIGS)) {
    throw new Error(
      `Provider ${provider} does not support subscription sign-in yet. ` +
      `Please paste an API key under Advanced options.`
    );
  }

  if (inDesktopShell()) {
    return await desktopLogin(provider);
  }

  // Web flow: popup + callback relay
  const verifier = randomBase64url();
  const state = randomBase64url();
  const redirect = callbackUrl(provider);

  const authUrl = await buildAuthUrl(provider, redirect, verifier, state);

  // Emit authUrl so caller can show manual fallback
  onAuthUrl?.(authUrl);

  const payload = await waitForPopupCallback(
    authUrl,
    state,
    needsManualCallback(provider),
  );
  const code = payload.code || payload.token || "";
  if (!code) throw new Error("No authorization code received.");

  const apiKey = await exchangeCode(provider, code, verifier, redirect, state);
  return { provider, apiKey };
}

// ─── Legacy completeOAuthReturn (no-op in popup flow) ────────────────────────

export type { OAuthReturn as OAuthReturnType };

/**
 * In popup-based flow this is no longer needed (callback page relays via
 * postMessage). Kept for backward compatibility — always returns null.
 */
export async function completeOAuthReturn(): Promise<OAuthReturn | null> {
  // Popup flow: callback page relays data; no redirect on main window.
  // If somehow the main window ended up at /callback (e.g. popup was blocked
  // and user pasted URL into main tab), handle it gracefully.
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const pendingRaw = safeStore.get(PENDING_KEY);
  if (!code || !pendingRaw) return null;

  safeStore.remove(PENDING_KEY);
  const pending = JSON.parse(pendingRaw) as {
    provider: ProviderId;
    verifier: string;
    state: string;
    context: OAuthReturn["context"];
  };
  window.history.replaceState({}, "", window.location.pathname);

  const key = await exchangeCode(
    pending.provider,
    code,
    pending.verifier,
    callbackUrl(pending.provider),
    pending.state,
  );
  return { provider: pending.provider, apiKey: key, context: pending.context };
}

// ─── Vendor account fetch ─────────────────────────────────────────────────────

function parseJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(
      atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""),
    ));
  } catch { return null; }
}

export interface VendorAccount {
  label: string;
  detail?: string;
}

export async function fetchVendorAccount(
  provider: ProviderId,
  apiKey: string,
): Promise<VendorAccount | null> {
  if (DEMO_MODE) {
    return { label: `Demo user · ${getProvider(provider).name}`, detail: "Preview account" };
  }
  try {
    if (provider === "openrouter") {
      const res = await fetch(devUrl("https://openrouter.ai/api/v1/key"), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return null;
      const { data } = (await res.json()) as { data?: { label?: string; limit?: number | null; usage?: number } };
      const label = data?.label?.trim() || "OpenRouter account";
      const detail = data?.limit != null
        ? `$${(data.limit - (data.usage ?? 0)).toFixed(2)} credit left`
        : undefined;
      return { label, detail };
    }
    if (provider === "chatgpt") {
      const payload = parseJwt(apiKey);
      const profile = payload?.["https://api.openai.com/profile"];
      return { label: profile?.email || payload?.email || "OpenAI User", detail: "Connected via ChatGPT" };
    }
    if (provider === "claude") {
      const res = await fetch(devUrl("https://api.anthropic.com/api/claude_cli/bootstrap"), {
        headers: { Authorization: `Bearer ${apiKey}`, "anthropic-beta": "oauth-2025-04-20" },
      });
      if (res.ok) {
        const data = await res.json();
        const email = data?.oauth_account?.account_email;
        if (email) return { label: email, detail: "Connected via Claude" };
      }
      return { label: "Claude User", detail: "Connected via Claude" };
    }
    if (provider === "gemini") {
      const res = await fetch(devUrl("https://www.googleapis.com/oauth2/v1/userinfo"), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.email) return { label: data.email, detail: data.name || "Connected via Gemini" };
      }
      return { label: "Gemini User", detail: "Connected via Gemini" };
    }
  } catch { /* fall through */ }
  return null;
}
