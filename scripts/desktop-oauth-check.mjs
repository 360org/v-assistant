#!/usr/bin/env node

const baseUrl = process.env.AI_ROUTER_BASE_URL || "http://127.0.0.1:20128/v1";

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gemini = await post("/oauth/authorize", {
  provider: "antigravity",
  redirectUri: "http://localhost:1420/callback",
});
assert(gemini.response.ok, `Antigravity authorize failed: ${gemini.payload.error || gemini.response.status}`);
assert(gemini.payload.authUrl?.startsWith("https://accounts.google.com/"), "Antigravity did not return a Google authorization URL.");
assert(gemini.payload.redirectUri === "http://localhost:1420/callback", "Antigravity callback URI changed unexpectedly.");
assert(gemini.payload.state && gemini.payload.codeVerifier, "Antigravity authorization is missing PKCE state.");

const claude = await post("/oauth/authorize", {
  provider: "claude",
  redirectUri: "http://localhost:1420/callback",
});
assert(claude.response.ok, `Claude authorize failed: ${claude.payload.error || claude.response.status}`);
assert(claude.payload.redirectUri === "http://localhost:443/callback", "Claude fixed callback URI changed unexpectedly.");

const invalidExchange = await post("/oauth/exchange", {
  provider: "antigravity",
  code: "not-a-real-code",
  redirectUri: gemini.payload.redirectUri,
  codeVerifier: gemini.payload.codeVerifier,
  state: gemini.payload.state,
});
assert(invalidExchange.response.status === 422, "Invalid Antigravity code must be rejected by AI Router.");
assert(typeof invalidExchange.payload.error === "string" && invalidExchange.payload.error.length > 0, "AI Router must return an OAuth error payload.");
assert(!invalidExchange.payload.error.includes("Load failed"), "OAuth exchange must not leak a WebView Load failed error.");

console.log("desktop OAuth contract passed: Antigravity + Claude authorize, sidecar exchange error path");
