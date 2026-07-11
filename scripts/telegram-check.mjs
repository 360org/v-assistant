// End-to-end check of the in-app Telegram channel (src/runtime/telegram.ts).
//
// Proves the flow the user actually experiences:
//   incoming Telegram message → embedded assistant runs (real provider code
//   path) → reply sent back via sendMessage — all inside the app, no engine
//   process, no Docker.
//
// The Telegram Bot API is stubbed via a fetch interceptor; the model is a
// real mock OpenAI-compatible SSE server, so streamProvider runs for real.

import { createServer } from "node:http";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const MODEL_PORT = 8142;

// --- Mock model (OpenAI-compatible SSE) -------------------------------------
const model = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { messages } = JSON.parse(body || "{}");
    const user = [...messages].reverse().find((m) => m.role === "user");
    const reply = `Reply to: ${user?.content ?? ""}`;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const w of reply.split(/(?<=\s)/)) {
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`,
      );
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });
});
await new Promise((r) => model.listen(MODEL_PORT, r));

// --- Stub the Telegram Bot API via a fetch interceptor ----------------------
const sent = [];
let updatesServed = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("api.telegram.org")) {
    if (u.includes("/getUpdates")) {
      updatesServed++;
      // 1st call is the backlog drain (returns nothing); 2nd delivers the
      // message; later calls are empty long-polls.
      const result =
        updatesServed === 2
          ? [
              {
                update_id: 10,
                message: { text: "hello from telegram", chat: { id: 99 } },
              },
            ]
          : [];
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/sendMessage")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  return realFetch(url, init);
};

// Vault (web branch) uses localStorage; provide a minimal shim.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// --- Bundle the REAL app modules for Node -----------------------------------
const entry = `
import { startTelegram, stopTelegram } from "../src/runtime/telegram.ts";
import { saveVaultEntry } from "../src/runtime/vault.ts";
globalThis.saveVaultEntry = saveVaultEntry;
globalThis.startTelegram = startTelegram;
globalThis.stopTelegram = stopTelegram;
`;
writeFileSync("scripts/.telegram-entry.mjs", entry);
const outfile = "scripts/.telegram-bundle.mjs";
await build({
  entryPoints: ["scripts/.telegram-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
await import(pathToFileURL(outfile).href);

// Save the Telegram bot token as the integration does.
await globalThis.saveVaultEntry({
  id: "integration:telegram",
  label: "Telegram",
  service: "telegram",
  fields: [{ label: "Bot token", value: "123:FAKE", type: "password" }],
  updatedAt: Date.now(),
});

// Start the channel with a live provider (points at the mock model).
globalThis.startTelegram(() => ({
  provider: "openrouter",
  config: { apiKey: "x", baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`, model: "mock" },
}));

// Wait for a reply to be sent back (up to ~8s).
const deadline = Date.now() + 8000;
while (sent.length === 0 && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 100));
}
globalThis.stopTelegram();
model.close();
rmSync("scripts/.telegram-entry.mjs", { force: true });
rmSync(outfile, { force: true });

const reply = sent[0];
const ok =
  reply && reply.chat_id === 99 && String(reply.text).includes("hello from telegram");
console.log("reply sent to chat :", reply?.chat_id);
console.log("reply text         :", JSON.stringify(reply?.text));
console.log(ok ? "\n✓ Telegram 2-way channel works end-to-end" : "\n✗ FAILED");
process.exit(ok ? 0 : 1);
