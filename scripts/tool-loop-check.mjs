// End-to-end check of the in-app agent tool-calling loop.
//
// Proves the provider tool loop with the credential boundary:
//   1. The model calls `connector_request` using an opaque Vault ref and
//      {{credential:password}}, never a raw secret.
//   2. A trusted gateway executor resolves the variable and performs the POST.
//   3. The tool response is redacted before the model receives it.
//
// No Docker, no external engine — the agent acts entirely inside the app.

import { createServer } from "node:http";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const SECRET = "s3cr3t-token-xyz";
let blogGotSecret = false;
let modelSawSecret = false;
let toolGotOpaqueReference = false;

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
    modelSawSecret ||= JSON.stringify(messages).includes(SECRET);
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
                    name: "connector_request",
                    arguments: JSON.stringify({
                      credential_ref: "vault-entry:my-blog",
                      method: "POST",
                      url: `http://127.0.0.1:${BLOG_PORT}/posts`,
                      headers: {
                        Authorization: "Bearer {{credential:password}}",
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

// --- Bundle the real provider loop with a trusted gateway test executor -----
const entry = `
import { streamProvider } from "../src/runtime/providers.ts";
globalThis.run = async () => {
  const tools = [{
    schema: {
      type: "function",
      function: {
        name: "connector_request",
        description: "Use an opaque Vault reference",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    async run(args) {
      globalThis.toolGotOpaqueReference =
        args.credential_ref === "vault-entry:my-blog" &&
        args.headers.Authorization === "Bearer {{credential:password}}" &&
        !JSON.stringify(args).includes(${JSON.stringify(SECRET)});
      const headers = {
        ...args.headers,
        Authorization: args.headers.Authorization.replace(
          "{{credential:password}}",
          ${JSON.stringify(SECRET)},
        ),
      };
      const response = await fetch(args.url, { method: args.method, headers, body: args.body });
      return \`HTTP \${response.status}\\n{\"auth\":\"[REDACTED:password]\"}\`;
    },
  }];
  const config = { apiKey: "x", baseUrl: "http://127.0.0.1:${MODEL_PORT}/v1", model: "mock" };
  let out = "";
  for await (const chunk of streamProvider("openrouter", config, "system", [
    { id: "1", role: "user", content: "Post Hello to my blog", createdAt: 0 },
  ], tools)) {
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

const mod = await import(pathToFileURL(outfile).href);
const finalText = await globalThis.run();
toolGotOpaqueReference = globalThis.toolGotOpaqueReference === true;

blog.close();
model.close();
rmSync("scripts/.tool-loop-entry.mjs", { force: true });
rmSync(outfile, { force: true });

const ok = blogGotSecret && toolGotOpaqueReference && !modelSawSecret && finalText.includes("published");
console.log("blog received real secret :", blogGotSecret);
console.log("tool received opaque ref   :", toolGotOpaqueReference);
console.log("model received raw secret  :", modelSawSecret);
console.log("final streamed answer     :", JSON.stringify(finalText));
console.log(ok ? "\n✓ agent acted through an opaque credential capability" : "\n✗ FAILED");
process.exit(ok ? 0 : 1);
