// End-to-end check of the in-app agent tool-calling loop.
//
// Proves the real code path in src/runtime/{providers,tools,vault}.ts:
//   1. The model streams a request to call `http_request` (post to a blog),
//      referencing a Vault secret as {{vault:My Blog.password}}.
//   2. The app accumulates the streamed tool call, resolves the placeholder
//      from the Vault LOCALLY, and performs the real HTTP POST.
//   3. The blog server confirms it received the actual secret (never the
//      model), returns 201, and the model streams a final answer.
//
// No Docker, no external engine — the agent acts entirely inside the app.

import { createServer } from "node:http";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const SECRET = "s3cr3t-token-xyz";
let blogGotSecret = false;

// --- Mock blog (the target of the agent's action) ---------------------------
const blog = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/posts") {
    blogGotSecret = req.headers.authorization === `Bearer ${SECRET}`;
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: 42, status: "published" }));
  } else {
    res.writeHead(404).end();
  }
});

// --- Mock OpenAI-compatible model (drives the tool loop) ---------------------
function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
const model = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { messages } = JSON.parse(body || "{}");
    const calledTool = messages.some((m) => m.role === "tool");
    res.writeHead(200, { "Content-Type": "text/event-stream" });

    if (!calledTool) {
      // Round 1: ask to POST to the blog, using the secret by reference.
      sse(res, {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: {
                    name: "http_request",
                    arguments: JSON.stringify({
                      method: "POST",
                      url: `http://127.0.0.1:${BLOG_PORT}/posts`,
                      headers: {
                        Authorization: "Bearer {{vault:My Blog.password}}",
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ title: "Hello", body: "World" }),
                    }),
                  },
                },
              ],
            },
          },
        ],
      });
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      // Round 2: the tool result is in context → final answer.
      for (const w of "Done — your post is published.".split(/(?<=\s)/)) {
        sse(res, { choices: [{ delta: { content: w } }] });
      }
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });
});

const BLOG_PORT = 8131;
const MODEL_PORT = 8132;
await new Promise((r) => blog.listen(BLOG_PORT, r));
await new Promise((r) => model.listen(MODEL_PORT, r));

// --- Bundle the REAL app modules for Node, with a localStorage-backed Vault --
const entry = `
import { streamProvider } from "../src/runtime/providers.ts";
import { buildAgentTools } from "../src/runtime/tools.ts";
import { saveVaultEntry, newVaultId } from "../src/runtime/vault.ts";
globalThis.run = async () => {
  await saveVaultEntry({
    id: newVaultId(),
    label: "My Blog",
    url: "http://127.0.0.1:${BLOG_PORT}",
    password: ${JSON.stringify(SECRET)},
    updatedAt: Date.now(),
  });
  const config = { apiKey: "x", baseUrl: "http://127.0.0.1:${MODEL_PORT}/v1", model: "mock" };
  let out = "";
  for await (const chunk of streamProvider("openrouter", config, "system", [
    { id: "1", role: "user", content: "Post Hello to my blog", createdAt: 0 },
  ], buildAgentTools())) {
    out += chunk;
  }
  return out;
};
`;
writeFileSync("scripts/.tool-loop-entry.mjs", entry);
const outfile = "scripts/.tool-loop-bundle.mjs";
await build({
  entryPoints: ["scripts/.tool-loop-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
});

// Vault (web branch) uses localStorage; provide a minimal shim.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const mod = await import(pathToFileURL(outfile).href);
const finalText = await globalThis.run();

blog.close();
model.close();
rmSync("scripts/.tool-loop-entry.mjs", { force: true });
rmSync(outfile, { force: true });

const ok = blogGotSecret && finalText.includes("published");
console.log("blog received real secret :", blogGotSecret);
console.log("final streamed answer     :", JSON.stringify(finalText));
console.log(ok ? "\n✓ agent used the Vault and acted end-to-end" : "\n✗ FAILED");
process.exit(ok ? 0 : 1);
