/**
 * Telegram channel, running in the Host Process.
 *
 * idea.md §1.3 puts the brain in the host daemon: closing the app window must
 * not stop the bot. This module long-polls Telegram, answers with the very same
 * agent loop the chat UI uses, and sends the reply back — all without the app
 * being open.
 *
 * The bot token never reaches this process. Telegram carries it in the URL path
 * (`/bot<token>/getUpdates`), which the connector gateway refuses on purpose, so
 * the AI Router — the only component allowed to resolve Vault secrets — performs
 * the Telegram calls and exposes three token-free endpoints instead. We drive
 * those with the runner's connector capability.
 *
 * Every turn is also written to `messages_out` (channel_type `telegram`, thread
 * = chat id) so the app can show the conversation when it is open.
 */
import { getContinuation, setContinuation, getTranscript, setTranscript, sessionIdFor, writeMessageOut } from '../db/index.js';
import { executeAgentLoop, type PollLoopConfig } from '../poll-loop.js';
import type { RoutingContext } from '../formatter.js';

const ROUTER_URL = process.env.VUA_AI_ROUTER_URL || 'http://127.0.0.1:20128';
const LONG_POLL_SECONDS = 30;
/** Wait before retrying when the router is down or no token is stored yet. */
const RETRY_MS = 5_000;
/** Yield after an empty poll, in case the far side returned without blocking. */
const IDLE_MS = 1_000;
const GREETING = 'Xin chào! Tôi là V-Assistant. Nhắn gì cũng được, tôi giúp ngay.';

interface TelegramUpdate {
  updateId: number;
  text: string | null;
  chatId: number | null;
}

function log(msg: string): void {
  console.error(`[telegram] ${msg}`);
}

/** Sleep that gives up as soon as the channel is asked to stop. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

function generateId(): string {
  return `tg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Routing that tags a turn as belonging to one Telegram chat. */
export function telegramRouting(chatId: number): RoutingContext {
  return { platformId: 'telegram', channelType: 'telegram', threadId: String(chatId) };
}

async function callRouter<T>(path: string, init: RequestInit = {}): Promise<T> {
  const capability = process.env.VUA_CONNECTOR_GATEWAY_TOKEN;
  if (!capability) throw new Error('Connector capability is not available');
  const response = await fetch(`${ROUTER_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${capability}`,
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & T;
  if (!response.ok) throw new Error(String(body.error ?? `Router returned ${response.status}`));
  return body;
}

/** Whether a bot token is stored. Never returns the token itself. */
export async function telegramConfigured(): Promise<boolean> {
  const status = await callRouter<{ configured?: boolean }>('/v1/channels/telegram/status');
  return Boolean(status.configured);
}

async function getUpdates(offset: number, timeout: number): Promise<TelegramUpdate[]> {
  const body = await callRouter<{ updates?: TelegramUpdate[] }>('/v1/channels/telegram/updates', {
    method: 'POST',
    body: JSON.stringify({ offset, timeout }),
  });
  return Array.isArray(body.updates) ? body.updates : [];
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  await callRouter('/v1/channels/telegram/send', {
    method: 'POST',
    body: JSON.stringify({ chatId, text }),
  });
}

/**
 * Push a message to the chat id stored in the Vault (the router fills it in).
 * Best-effort: used to deliver scheduled results, which must not fail a run.
 */
export async function notifyTelegram(text: string): Promise<boolean> {
  try {
    await callRouter('/v1/channels/telegram/send', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Mirror one Telegram turn into the outbound queue so the UI can show it. */
function recordTurn(chatId: number, role: 'user' | 'assistant', text: string): void {
  const routing = telegramRouting(chatId);
  writeMessageOut({
    id: generateId(),
    kind: 'chat',
    platform_id: routing.platformId,
    channel_type: routing.channelType,
    thread_id: routing.threadId,
    content: JSON.stringify({ text, role, chatId }),
  });
}

/**
 * Answer one Telegram message. Exported so the channel can be tested without
 * driving the poll loop.
 */
export async function handleMessage(config: PollLoopConfig, chatId: number, text: string): Promise<void> {
  if (text.startsWith('/start')) {
    await sendMessage(chatId, GREETING);
    return;
  }

  const routing = telegramRouting(chatId);
  const sessionId = sessionIdFor(config.agentId || 'default', routing);
  recordTurn(chatId, 'user', text);

  try {
    const priorTranscript = getTranscript(sessionId);
    const result = await executeAgentLoop(
      config,
      text,
      getContinuation(sessionId, config.providerName),
      routing,
      config.systemContext,
      priorTranscript,
    );
    if (result.continuation) setContinuation(sessionId, config.providerName, result.continuation);

    const reply = result.text?.trim();
    if (!reply) {
      await sendMessage(chatId, '…');
      return;
    }
    setTranscript(sessionId, [
      ...priorTranscript,
      { role: 'user', content: text },
      { role: 'assistant', content: reply },
    ]);
    recordTurn(chatId, 'assistant', reply);
    await sendMessage(chatId, reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Turn failed for chat ${chatId}: ${message}`);
    await sendMessage(chatId, `⚠️ ${message}`).catch(() => undefined);
  }
}

/**
 * Long-poll Telegram until `signal` aborts. The first pass drains the backlog
 * without answering, so restarting the app does not replay old messages.
 */
export async function runTelegramLoop(config: PollLoopConfig, signal?: AbortSignal): Promise<void> {
  let offset = 0;
  let drained = false;
  let announced = false;

  while (!signal?.aborted) {
    let updates: TelegramUpdate[];
    try {
      if (!(await telegramConfigured())) {
        await sleep(RETRY_MS, signal);
        continue;
      }
      if (!announced) {
        log('Connected — listening for messages');
        announced = true;
      }
      updates = await getUpdates(offset, drained ? LONG_POLL_SECONDS : 0);
    } catch (error) {
      // The router may still be booting, or the token may have been removed.
      log(`Poll failed: ${error instanceof Error ? error.message : String(error)}`);
      announced = false;
      await sleep(RETRY_MS, signal);
      continue;
    }

    for (const update of updates) offset = Math.max(offset, update.updateId + 1);

    if (!drained) {
      drained = true;
      continue;
    }

    // Long-polling already blocks on the far side; this keeps a server that
    // answers immediately from turning the loop hot.
    if (updates.length === 0) {
      await sleep(IDLE_MS, signal);
      continue;
    }

    for (const update of updates) {
      if (signal?.aborted) return;
      if (!update.text || update.chatId == null) continue;
      await handleMessage(config, update.chatId, update.text);
    }
  }
}

/** Start the channel in the background. Runs until the process exits. */
export function startTelegramChannel(config: PollLoopConfig): void {
  void runTelegramLoop(config, config.signal).catch((error) => {
    log(`Channel stopped: ${error instanceof Error ? error.message : String(error)}`);
  });
}
