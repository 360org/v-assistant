// Proves the Anthropic runner adapter retries a transient 429 before failing.

import { createAnthropicProvider } from "../src/providers/adapters/anthropic.ts";

let calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, init) => {
  calls++;
  if (calls === 1) {
    return new Response(JSON.stringify({ error: { message: "rate limited" } }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "0" },
    });
  }

  const body = JSON.stringify({
    type: "content_block_delta",
    delta: { type: "text_delta", text: "retried reply" },
  });
  return new Response(`data: ${body}\n\n`, {
    headers: { "Content-Type": "text/event-stream" },
  });
};

const provider = createAnthropicProvider({ apiKey: "test-key", model: "claude-sonnet-5" });
let text = "";
let error = "";
for await (const event of provider.query({ prompt: "hello" }).events) {
  if (event.type === "text_delta") text += event.text;
  if (event.type === "error") error = event.message;
}

globalThis.fetch = originalFetch;

const pass = calls === 2 && text === "retried reply" && !error;
console.log(`${pass ? "✓" : "✗"} Anthropic runner retries one 429 response`);
process.exit(pass ? 0 : 1);
