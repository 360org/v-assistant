/**
 * Telegram channel — a real 2-way bridge that runs inside the app.
 *
 * The user's job is only: connect Telegram (paste the @BotFather token) and
 * message the bot. This service does the rest: it long-polls Telegram for
 * incoming messages, runs the same embedded assistant the chat UI uses
 * (provider + agent + Vault-powered tools), and sends the reply back. No
 * server, no Docker — Telegram's Bot API is callable directly from the app.
 *
 * The token is read from the Vault entry saved by the Telegram integration,
 * so credentials live in one place and the channel picks them up
 * automatically.
 */

import { runAssistant, newMessageId, type ChatOptions } from "./engine";
import { findVaultEntry, readField } from "./vault";

const API = "https://api.telegram.org";
const TELEGRAM_MAX = 4096;

/** Latest chat context (provider, agent, config) — resolved per message. */
export type ResolveOptions = () => ChatOptions | null;

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number };
  };
}

let running = false;
let generation = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Bot token from the Vault entry the Telegram integration saved. */
async function botToken(): Promise<string | null> {
  const entry = await findVaultEntry("telegram");
  if (!entry) return null;
  return (
    readField(entry, "Bot token") ??
    readField(entry, "botToken") ??
    entry.fields?.find((f) => /token/i.test(f.label))?.value ??
    null
  );
}

async function getUpdates(
  token: string,
  offset: number,
  timeout: number,
): Promise<TelegramUpdate[]> {
  const url =
    `${API}/bot${token}/getUpdates?timeout=${timeout}` +
    (offset ? `&offset=${offset}` : "");
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) throw new Error(data.description ?? "getUpdates failed");
  return data.result as TelegramUpdate[];
}

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  const body = text.slice(0, TELEGRAM_MAX) || "…";
  await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body }),
  });
}

/** True once a valid-looking bot token is stored. */
export async function telegramTokenPresent(): Promise<boolean> {
  return Boolean(await botToken());
}

/**
 * Start the Telegram channel. Idempotent: a second call is a no-op while one
 * is already running. `resolve` returns the current chat options each time a
 * message arrives, so provider/agent switches take effect live.
 */
export function startTelegram(resolve: ResolveOptions): void {
  if (running) return;
  running = true;
  const myGen = ++generation;
  void loop(resolve, myGen);
}

/** Stop the channel; the in-flight long-poll ends on its own. */
export function stopTelegram(): void {
  running = false;
  generation++;
}

async function loop(resolve: ResolveOptions, myGen: number): Promise<void> {
  let offset = 0;
  let drained = false;
  while (running && myGen === generation) {
    const token = await botToken();
    if (!token) {
      await sleep(2000);
      continue;
    }
    let updates: TelegramUpdate[];
    try {
      // First pass: drain any backlog quickly so we don't reply to messages
      // sent before the app opened; afterwards, long-poll.
      updates = await getUpdates(token, offset, drained ? 30 : 0);
    } catch {
      await sleep(3000);
      continue;
    }

    if (!drained) {
      // Skip the backlog: advance past it without answering.
      for (const u of updates) offset = Math.max(offset, u.update_id + 1);
      drained = true;
      continue;
    }

    // No messages this poll — yield before polling again. Long-polling
    // already blocks server-side; this also stops a hot loop if a server
    // returns immediately, and keeps timers responsive.
    if (updates.length === 0) {
      await sleep(1000);
      continue;
    }

    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      if (!running || myGen !== generation) break;
      const text = update.message?.text;
      const chatId = update.message?.chat?.id;
      if (!text || chatId == null) continue;

      if (text.startsWith("/start")) {
        await sendMessage(
          token,
          chatId,
          "Hi! I'm your V Assistant. Send me anything and I'll help.",
        );
        continue;
      }

      const options = resolve();
      if (!options) {
        await sendMessage(
          token,
          chatId,
          "Open V Assistant and sign in first, then message me again.",
        );
        continue;
      }

      try {
        const reply = await runAssistant(
          [
            {
              id: newMessageId(),
              role: "user",
              content: text,
              createdAt: Date.now(),
            },
          ],
          options,
        );
        await sendMessage(token, chatId, reply);
      } catch (e) {
        await sendMessage(
          token,
          chatId,
          `⚠️ ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
}
