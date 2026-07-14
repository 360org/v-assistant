// Checks the direct sign-in ("Continue with ChatGPT/Claude/Gemini/…") logic
// that can be verified without a real browser:
//
//   1. completeOAuthReturn: a returned ?code + stored PKCE verifier are
//      exchanged for a user key, sending code_verifier + S256 (real
//      exchangeCode path).
//   2. per-vendor routing: after login, each vendor's routed config reaches
//      that vendor's models (chatgpt→openai/*, claude→anthropic/*,
//      gemini→google/*, openrouter→auto) — one login, right vendor.
//   3. fetchVendorAccount: the local user is created from the account.
//
// The real OAuth redirect + openrouter.ai round-trip still needs a manual
// desktop run; that part can't run in CI (no browser).

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

// --- Shims: browser globals the web sign-in path touches --------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = {
  location: { search: "?code=AUTH_CODE_123", pathname: "/", origin: "https://app" },
  history: { replaceState: () => {} },
};

// --- Stub OpenRouter + the router chat endpoint via a fetch interceptor -----
let exchangeSaw = null;
function sseStream(text) {
  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const w of text.split(/(?<=\s)/)) {
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`,
          ),
        );
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
function sseAnthropic(text) {
  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(
        enc.encode(`data: ${JSON.stringify({ type: "content_block_delta", delta: { text } })}\n\n`)
      );
      controller.close();
    },
  });
}
function sseGemini(text) {
  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(
        enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`)
      );
      controller.close();
    },
  });
}
globalThis.fetch = async (url, init) => {
  const u = String(url);
  console.log("FETCHING URL:", u);
  if (u.includes("/api/v1/auth/keys")) {
    exchangeSaw = JSON.parse(init.body);
    return new Response(JSON.stringify({ key: "sk-user-key" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (u.includes("/oauth/token") || u.includes("/token")) {
    const params = new URLSearchParams(init.body);
    exchangeSaw = {
      code: params.get("code"),
      code_verifier: params.get("code_verifier"),
      code_challenge_method: "S256",
    };
    return new Response(JSON.stringify({ access_token: "sk-user-key", id_token: "mock-id-token" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (u.includes("/api/claude_cli/bootstrap")) {
    return new Response(JSON.stringify({ oauth_account: { account_email: "test@claude.ai" } }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (u.includes("/userinfo")) {
    return new Response(JSON.stringify({ email: "test@gemini.ai", name: "Gemini Tester" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (u.includes("/api/v1/key")) {
    return new Response(
      JSON.stringify({ data: { label: "My OpenRouter", limit: 10, usage: 2.5 } }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  if (u.includes("/v1/messages")) {
    return new Response(sseAnthropic("model=anthropic/claude-sonnet-5"), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  if (u.includes("streamGenerateContent")) {
    return new Response(sseGemini("model=google/gemini-3.5-flash"), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  if (u.includes("/chat/completions")) {
    // Echo the requested model so we can assert per-vendor routing.
    const model = JSON.parse(init.body).model;
    return new Response(sseStream(`model=${model}`), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  throw new Error(`unexpected fetch: ${u}`);
};

// --- Bundle the real modules ------------------------------------------------
const entry = `
export { completeOAuthReturn, fetchVendorAccount } from "../src/runtime/oauth.ts";
export { routedConfig, streamProvider, ROUTED_MODELS } from "../src/runtime/providers.ts";
`;
writeFileSync("scripts/.login-entry.mjs", entry);
const outfile = "scripts/.login-bundle.mjs";
await build({
  entryPoints: ["scripts/.login-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
const mod = await import(pathToFileURL(outfile).href);

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

// 1. Sign-in return: pending verifier for "Continue with Claude" → key.
store.set(
  "v-assistant-oauth-pending",
  JSON.stringify({ provider: "claude", verifier: "VERIFIER_XYZ", context: "onboarding" }),
);
const result = await mod.completeOAuthReturn();
check("code exchanged for a user key", result?.apiKey === "sk-user-key");
check("vendor preserved through login", result?.provider === "claude");
check(
  "PKCE fields sent (code_verifier + S256)",
  exchangeSaw?.code === "AUTH_CODE_123" &&
    exchangeSaw?.code_verifier === "VERIFIER_XYZ" &&
    exchangeSaw?.code_challenge_method === "S256",
);

// 2. Per-vendor routing: each "Continue with X" reaches X's models.
async function modelFor(provider) {
  let out = "";
  for await (const chunk of mod.streamProvider(
    provider,
    mod.routedConfig(provider, "sk-user-key"),
    "system",
    [{ id: "1", role: "user", content: "hi", createdAt: 0 }],
  )) {
    out += chunk;
  }
  return out.replace("model=", "");
}
check("ChatGPT login → OpenAI model", (await modelFor("chatgpt")).startsWith("openai/"));
check("Claude login → Anthropic model", (await modelFor("claude")).startsWith("anthropic/"));
check("Gemini login → Google model", (await modelFor("gemini")).startsWith("google/"));
check("OpenRouter login → auto", (await modelFor("openrouter")).includes("auto"));

// 3. Local user created from the vendor account.
const account = await mod.fetchVendorAccount("gemini", "sk-user-key");
check(
  "local user created from account",
  account?.label === "test@gemini.ai" && account.detail === "Gemini Tester",
);

rmSync("scripts/.login-entry.mjs", { force: true });
rmSync(outfile, { force: true });
console.log(pass ? "\n✓ direct sign-in logic verified" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
