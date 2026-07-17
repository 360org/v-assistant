/**
 * Self-improving memory (Hermes-style).
 *
 * After each exchange, a role reflects on what just happened and extracts a
 * few durable facts about the user worth remembering next time. The notes are
 * written into that role's OWN memory (isolated per role), so a role gets
 * smarter about the user over time without anyone editing memory by hand.
 *
 * Reflection is a cheap, tool-free model call and is best-effort: any failure
 * simply means nothing new is learned this turn.
 */

import { streamProvider, type ProviderConfig } from "./providers";
import type { ChatMessage } from "./engine";
import type { ProviderId } from "@/lib/catalog";

const REFLECT_SYSTEM =
  "You maintain a long-term memory about the user for one assistant role. " +
  "From the latest exchange, extract 0-3 SHORT, durable facts or preferences " +
  "worth remembering in future chats (e.g. \"Prefers answers in Vietnamese\", " +
  "\"Runs a coffee shop called Highland\"). Only stable, reusable facts — never " +
  "one-off task details, and never anything already in the existing memory. " +
  "Return ONLY a JSON array of strings; return [] if nothing is worth saving.";

/** Pull the first JSON array out of a model reply. */
function parseNotes(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Reflect on one exchange and return NEW memory notes for this role (deduped
 * against `existing`, capped at 3). Empty when there's nothing to learn or the
 * provider isn't configured.
 */
export async function reflectAndLearn(
  exchange: { user: string; assistant: string },
  provider: ProviderId,
  config: ProviderConfig | undefined,
  existing: string[],
): Promise<string[]> {
  if (!config || (!config.apiKey && !config.baseUrl)) return [];
  if (exchange.user.trim().length < 3 || !exchange.assistant.trim()) return [];

  const messages: ChatMessage[] = [
    {
      id: "reflect",
      role: "user",
      content:
        `User said:\n${exchange.user}\n\n` +
        `Assistant replied:\n${exchange.assistant}\n\n` +
        `Existing memory:\n${
          existing.length ? existing.map((m) => `- ${m}`).join("\n") : "(none)"
        }\n\n` +
        `Return the JSON array of NEW memory notes to add.`,
      createdAt: Date.now(),
    },
  ];

  let out = "";
  try {
    // No tools during reflection — it's a pure extraction call.
    for await (const chunk of streamProvider(provider, config, REFLECT_SYSTEM, messages)) {
      out += chunk;
    }
  } catch {
    return [];
  }

  const seen = new Set(existing.map((m) => m.trim().toLowerCase()));
  const fresh: string[] = [];
  for (const note of parseNotes(out)) {
    const n = note.trim();
    const key = n.toLowerCase();
    if (n && !seen.has(key)) {
      seen.add(key);
      fresh.push(n);
    }
  }
  return fresh.slice(0, 3);
}
