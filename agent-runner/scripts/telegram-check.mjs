// Checks the Host Process Telegram channel: it authenticates to the AI Router,
// never touches the bot token, skips the backlog on start, answers with the
// shared agent loop, and mirrors the turn into outbound.db.
// A stub router stands in for the real one, so this is deterministic and offline.
// Run: npx tsx scripts/telegram-check.mjs

import { createServer } from 'http';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const dir = mkdtempSync(path.join(tmpdir(), 'ar-tg-'));
process.env.VUA_DATA_DIR = dir;
process.env.VUA_IPC_DIR = path.join(dir, 'ipc');
process.env.VUA_CONNECTOR_GATEWAY_TOKEN = 'test-capability';

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) pass = false;
};

// --- stub AI Router ----------------------------------------------------------
// Mirrors the real endpoints in ai-router/src/sidecar.mjs: bearer-guarded, and
// it hands out messages only — a bot token never crosses this boundary.
const sent = [];
let authFailures = 0;
let pending = [];       // updates the next getUpdates call returns
let configured = true;
let abortAfterSend = null;

const server = createServer((req, res) => {
  const reply = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== 'Bearer test-capability') {
    authFailures++;
    return reply(401, { error: 'Connector capability is invalid.' });
  }
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const input = raw ? JSON.parse(raw) : {};
    if (req.url === '/v1/channels/telegram/status') return reply(200, { configured, hasChatId: true });
    if (req.url === '/v1/channels/telegram/updates') {
      const updates = pending;
      pending = [];
      return reply(200, { updates, echoedOffset: input.offset ?? 0 });
    }
    if (req.url === '/v1/channels/telegram/send') {
      sent.push(input);
      abortAfterSend?.();
      return reply(200, { ok: true });
    }
    reply(404, { error: 'not found' });
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.env.VUA_AI_ROUTER_URL = `http://127.0.0.1:${server.address().port}`;

// --- runner wiring -----------------------------------------------------------
const { createInboundSchema, closeAll, getOutboundDb } = await import('../src/db/connection.ts');
createInboundSchema();

const { handleMessage, runTelegramLoop, telegramConfigured } = await import('../src/channels/telegram.ts');

let prompts = [];
const stubProvider = {
  name: 'stub',
  query: ({ prompt, messages }) => {
    prompts.push({ prompt, history: messages ?? [] });
    return {
      events: (async function* () {
        yield { type: 'result', text: `echo: ${prompt}` };
      })(),
    };
  },
  isSessionInvalid: () => false,
};
const config = {
  provider: stubProvider,
  providerName: 'stub',
  agentId: 'default',
  systemContext: { instructions: '' },
};

// --- the capability is required ---------------------------------------------
check('the channel reports the stored token without revealing it', await telegramConfigured());

const saved = process.env.VUA_CONNECTOR_GATEWAY_TOKEN;
process.env.VUA_CONNECTOR_GATEWAY_TOKEN = 'wrong';
let rejected = false;
try {
  await telegramConfigured();
} catch {
  rejected = true;
}
check('a wrong capability is rejected by the router', rejected && authFailures === 1);
process.env.VUA_CONNECTOR_GATEWAY_TOKEN = saved;

// --- one answered message ----------------------------------------------------
await handleMessage(config, 42, 'chào em');
check('the reply goes back to the same chat', sent.length === 1 && sent[0].chatId === 42);
check('the reply is the agent answer', sent[0].text === 'echo: chào em');

const rows = getOutboundDb().prepare('SELECT channel_type, thread_id, content FROM messages_out ORDER BY seq').all();
check('both sides of the turn are mirrored to outbound.db', rows.length === 2);
check('the mirror is tagged as the telegram channel', rows.every((r) => r.channel_type === 'telegram'));
check('the mirror threads by chat id', rows.every((r) => r.thread_id === '42'));
check(
  'the mirror keeps the user turn and the answer apart',
  JSON.parse(rows[0].content).role === 'user' && JSON.parse(rows[1].content).role === 'assistant',
);

// --- the conversation remembers itself ---------------------------------------
await handleMessage(config, 42, 'còn nhớ không?');
check('the next turn carries the prior transcript', prompts[1].history.length === 2);
await handleMessage(config, 99, 'hello');
check('a second chat does not inherit the first', prompts[2].history.length === 0);

// --- /start is answered without spending a model call ------------------------
const before = prompts.length;
await handleMessage(config, 42, '/start');
check('/start replies without calling the model', prompts.length === before);
check('/start greets the user', /V-Assistant/.test(sent[sent.length - 1].text));

// --- the backlog is skipped on start -----------------------------------------
sent.length = 0;
prompts = [];
pending = [
  { updateId: 7, text: 'tin cũ 1', chatId: 5 },
  { updateId: 8, text: 'tin cũ 2', chatId: 5 },
];
const controller = new AbortController();
const loop = runTelegramLoop(config, controller.signal);
// Let the drain pass consume the backlog, then deliver a live message. The
// stub answers instantly, so the loop is in its idle wait by now.
await new Promise((r) => setTimeout(r, 200));
abortAfterSend = () => controller.abort();
pending = [{ updateId: 9, text: 'tin mới', chatId: 5 }];
await loop;

check('the backlog is not answered', !sent.some((m) => /tin cũ/.test(m.text)));
check('a message that arrives while listening is answered', sent.some((m) => m.text === 'echo: tin mới'));

// --- an unconfigured token pauses instead of crashing ------------------------
configured = false;
const idle = new AbortController();
const idleLoop = runTelegramLoop(config, idle.signal);
await new Promise((r) => setTimeout(r, 50));
idle.abort();
await idleLoop;
check('no token means no Telegram traffic, not a crash', true);

server.close();
closeAll();
console.log(pass ? '\n✓ Host Process Telegram channel works' : '\n✗ FAILED');
process.exit(pass ? 0 : 1);
