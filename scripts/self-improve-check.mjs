// Proves self-improving memory: after an exchange, a role extracts durable
// facts, skips anything already known, and (via the store's cap/dedupe rules)
// keeps them in its own memory. Uses the real reflectAndLearn against a mock
// model.

import { createServer } from "node:http";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const MODEL_PORT = 8164;

// Mock model: returns whatever JSON array we set for the next call.
let nextReply = "[]";
const model = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const w of nextReply.split(/(?<=\s)/)) {
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`,
      );
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });
});
await new Promise((r) => model.listen(MODEL_PORT, r));

const entry = `export { reflectAndLearn } from "../src/runtime/selfImprove.ts";`;
writeFileSync("scripts/.selfimprove-entry.mjs", entry);
const outfile = "scripts/.selfimprove-bundle.mjs";
await build({
  entryPoints: ["scripts/.selfimprove-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
const { reflectAndLearn } = await import(pathToFileURL(outfile).href);

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};
const config = { apiKey: "x", baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`, model: "mock" };

// 1. Learns new durable facts from an exchange.
nextReply = '["Prefers answers in Vietnamese", "Runs a coffee shop called Highland"]';
const learned = await reflectAndLearn(
  { user: "Trả lời tiếng Việt nhé, tôi mở quán cà phê Highland", assistant: "Dạ vâng!" },
  "openrouter",
  config,
  [],
);
check("extracts new durable facts", learned.length === 2 && learned.includes("Prefers answers in Vietnamese"));

// 2. Skips facts already in memory (no duplicates).
nextReply = '["Prefers answers in Vietnamese", "Likes concise replies"]';
const deduped = await reflectAndLearn(
  { user: "ngắn gọn thôi", assistant: "ok" },
  "openrouter",
  config,
  ["Prefers answers in Vietnamese"],
);
check("skips facts already known", deduped.length === 1 && deduped[0] === "Likes concise replies");

// 3. Nothing to learn → empty.
nextReply = "[]";
const nothing = await reflectAndLearn({ user: "hi", assistant: "hello" }, "openrouter", config, []);
check("learns nothing when there's nothing durable", nothing.length === 0);

// 4. No provider configured → no call, empty.
const noProvider = await reflectAndLearn({ user: "x", assistant: "y" }, "openrouter", undefined, []);
check("no-op without a configured provider", noProvider.length === 0);

model.close();
rmSync("scripts/.selfimprove-entry.mjs", { force: true });
rmSync(outfile, { force: true });
console.log(pass ? "\n✓ self-improving memory works" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
