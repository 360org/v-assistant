// Minimal OpenAI-compatible /chat/completions server with SSE streaming.
// Used to exercise the real provider code path (Local AI) end-to-end
// without external credentials: point the Local AI provider at
// http://localhost:8123/v1 and chat.
import { createServer } from "node:http";

const PORT = process.env.PORT ?? 8123;

createServer((req, res) => {
  // Browser preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
    return res.writeHead(404).end();
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const { messages = [], model = "mock" } = JSON.parse(body || "{}");
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const user = [...messages].reverse().find((m) => m.role === "user");
    const reply =
      `Real streaming reply from ${model}: you said “${user?.content}”. ` +
      `System prompt begins: “${system.slice(0, 220)}…”`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    const words = reply.split(/(?<=\s)/);
    const timer = setInterval(() => {
      const word = words.shift();
      if (word === undefined) {
        res.write("data: [DONE]\n\n");
        res.end();
        clearInterval(timer);
        return;
      }
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`,
      );
    }, 15);
  });
}).listen(PORT, () => console.log(`mock-openai listening on :${PORT}`));
