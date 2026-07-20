// Proves the ChatGPT/OpenAI and Gemini runner adapters retry a transient 429.

import { createOpenAIProvider } from "../src/providers/adapters/openai.ts";
import { createGeminiProvider } from "../src/providers/adapters/gemini.ts";

const originalFetch = globalThis.fetch;

async function checkRetry(name, provider, responseBody) {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "0" },
      });
    }
    return new Response(responseBody, {
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  let text = "";
  let error = "";
  for await (const event of provider.query({ prompt: "hello" }).events) {
    if (event.type === "text_delta") text += event.text;
    if (event.type === "error") error = event.message;
  }
  const pass = calls === 2 && text === "retried reply" && !error;
  console.log(`${pass ? "✓" : "✗"} ${name} retries one 429 response`);
  return pass;
}

const openAIResponse = `data: ${JSON.stringify({
  id: "1", choices: [{ delta: { content: "retried reply" } }],
})}\n\ndata: [DONE]\n\n`;
const geminiResponse = `data: ${JSON.stringify({
  candidates: [{ content: { parts: [{ text: "retried reply" }] } }],
})}\n\n`;

const openAIPass = await checkRetry(
  "OpenAI",
  createOpenAIProvider({ apiKey: "test-key", model: "gpt-4o-mini" }),
  openAIResponse,
);
const geminiPass = await checkRetry(
  "Gemini",
  createGeminiProvider({ apiKey: "test-key", model: "gemini-2.5-flash" }),
  geminiResponse,
);

let toolLoopRequest = null;
globalThis.fetch = async (_url, init) => {
  toolLoopRequest = JSON.parse(String(init?.body || '{}'));
  return new Response('data: [DONE]\n\n', {
    headers: { 'Content-Type': 'text/event-stream' },
  });
};

for await (const _event of createOpenAIProvider({ apiKey: 'test-key' }).query({
  prompt: '',
  messages: [
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_glob', name: 'glob', arguments: { pattern: '*' } }],
    },
    { role: 'tool', content: '[]', tool_call_id: 'call_glob', name: 'glob' },
  ],
}).events) {
  // Consume the stream so the request is issued.
}

const normalizedToolCall = toolLoopRequest?.messages?.[0]?.tool_calls?.[0];
const toolLoopPass = normalizedToolCall?.type === 'function'
  && normalizedToolCall?.function?.name === 'glob'
  && normalizedToolCall?.function?.arguments === '{"pattern":"*"}'
  && toolLoopRequest?.messages?.[1]?.name === undefined;
console.log(`${toolLoopPass ? '✓' : '✗'} OpenAI-compatible tool history uses the function envelope`);

globalThis.fetch = originalFetch;
process.exit(openAIPass && geminiPass && toolLoopPass ? 0 : 1);
