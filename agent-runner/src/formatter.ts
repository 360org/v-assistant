/**
 * Message formatter — converts raw DB messages into prompts for the LLM.
 *
 * Handles routing extraction, message categorization, and command detection.
 *
 * @ref NanoClaw/container/agent-runner/src/formatter.ts
 */
import type { MessageInRow } from './db/messages-in.js';

export interface RoutingContext {
  platformId: string | null;
  channelType: string | null;
  threadId: string | null;
}

/**
 * Extract routing info from a batch of messages.
 * Uses the most recent message's routing fields.
 */
export function extractRouting(messages: MessageInRow[]): RoutingContext {
  // Use the last message's routing (most recent)
  const last = messages[messages.length - 1];
  return {
    platformId: last?.platform_id ?? null,
    channelType: last?.channel_type ?? null,
    threadId: last?.thread_id ?? null,
  };
}

/**
 * Format a batch of inbound messages into a single prompt string.
 *
 * For a single message, returns its content directly.
 * For multiple messages, combines them with timestamps and sender info.
 */
export function formatMessages(messages: MessageInRow[]): string {
  if (messages.length === 0) return '';
  if (messages.length === 1) {
    return extractContent(messages[0]);
  }

  // Multiple messages: format as a thread
  return messages
    .map((m) => {
      const content = extractContent(m);
      const ts = m.timestamp ? `[${m.timestamp}]` : '';
      const channel = m.channel_type ? ` (${m.channel_type})` : '';
      return `${ts}${channel} ${content}`;
    })
    .join('\n\n');
}

/**
 * Extract text content from a message.
 * Content may be plain text or JSON { text: "..." }.
 */
function extractContent(msg: MessageInRow): string {
  try {
    const parsed = JSON.parse(msg.content);
    if (typeof parsed === 'object' && parsed.text) {
      return parsed.text;
    }
    return msg.content;
  } catch {
    return msg.content;
  }
}

/**
 * Check if a message is a /clear command.
 */
export function isClearCommand(msg: MessageInRow): boolean {
  const content = extractContent(msg).trim().toLowerCase();
  return content === '/clear' || content === '/reset';
}

/**
 * Check if a message is a runner command (starts with /).
 */
export function isRunnerCommand(msg: MessageInRow): boolean {
  const content = extractContent(msg).trim();
  return content.startsWith('/');
}

/**
 * Strip internal tags from content before sending to the model.
 */
export function stripInternalTags(text: string): string {
  return text
    .replace(/<internal>[\s\S]*?<\/internal>/g, '')
    .replace(/<routing>[\s\S]*?<\/routing>/g, '')
    .trim();
}
