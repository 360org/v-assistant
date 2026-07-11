/**
 * NanoClaw engine skills — the capabilities the engine can install on
 * demand (channel adapters, alternative providers, and built-in powers).
 * On the desktop these map to NanoClaw's `/add-<name>` skills; the app
 * surfaces them so the user installs capabilities without touching code.
 */

export type EngineSkillKind = "channel" | "provider" | "capability";

export interface EngineSkillField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
}

export interface EngineSkill {
  id: string;
  name: string;
  emoji: string;
  kind: EngineSkillKind;
  description: string;
  /** The NanoClaw command this maps to, e.g. "/add-telegram". */
  command: string;
  /** Credentials to collect on install (stored in the Vault). */
  fields?: EngineSkillField[];
  /** Short how-to shown in the config dialog. */
  hint?: string;
}

export const NANOCLAW_SKILLS: EngineSkill[] = [
  // Channels
  {
    id: "telegram",
    name: "Telegram",
    emoji: "✈️",
    kind: "channel",
    description: "Talk to your assistant from Telegram.",
    command: "/add-telegram",
    hint: "Create a bot with @BotFather in Telegram, then paste its token.",
    fields: [
      {
        key: "botToken",
        label: "Bot token",
        placeholder: "123456789:ABCdef...",
        secret: true,
      },
      {
        key: "chatId",
        label: "Chat ID",
        placeholder: "@yourchannel or 123456789",
        optional: true,
      },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    emoji: "🟢",
    kind: "channel",
    description: "Message your assistant on WhatsApp.",
    command: "/add-whatsapp",
    hint: "Paste the access token and phone number ID from Meta.",
    fields: [
      { key: "token", label: "Access token", placeholder: "EAAG…", secret: true },
      { key: "phoneId", label: "Phone number ID", placeholder: "1234567890" },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    emoji: "🎮",
    kind: "channel",
    description: "Add the assistant to a Discord server.",
    command: "/add-discord",
    hint: "Create a bot in the Discord Developer Portal and copy its token.",
    fields: [
      { key: "token", label: "Bot token", placeholder: "Bot token", secret: true },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    emoji: "💼",
    kind: "channel",
    description: "Bring the assistant into Slack channels.",
    command: "/add-slack",
    hint: "Create a Slack app and copy its Bot User OAuth Token.",
    fields: [
      { key: "token", label: "Bot token", placeholder: "xoxb-…", secret: true },
    ],
  },
  {
    id: "imessage",
    name: "iMessage",
    emoji: "💬",
    kind: "channel",
    description: "Chat over iMessage (macOS).",
    command: "/add-imessage",
  },
  {
    id: "email",
    name: "Email",
    emoji: "📧",
    kind: "channel",
    description: "Send and receive email via Resend.",
    command: "/add-email",
    hint: "Paste your Resend API key and the address to send from.",
    fields: [
      { key: "apiKey", label: "Resend API key", placeholder: "re_…", secret: true },
      { key: "from", label: "From address", placeholder: "you@domain.com" },
    ],
  },
  // Providers
  {
    id: "opencode",
    name: "OpenCode Provider",
    emoji: "🔀",
    kind: "provider",
    description: "Route to OpenRouter, Google or DeepSeek models.",
    command: "/add-opencode",
  },
  {
    id: "ollama",
    name: "Ollama Provider",
    emoji: "🦙",
    kind: "provider",
    description: "Run local open-weight models with Ollama.",
    command: "/add-ollama-provider",
  },
  // Capabilities
  {
    id: "web",
    name: "Web Search & Fetch",
    emoji: "🌐",
    kind: "capability",
    description: "Let agents search and read the web.",
    command: "/add-web",
  },
  {
    id: "scheduler",
    name: "Scheduled Tasks",
    emoji: "⏰",
    kind: "capability",
    description: "Run recurring jobs and get results messaged back.",
    command: "/add-scheduler",
  },
];

export const ENGINE_SKILL_KIND_LABEL: Record<EngineSkillKind, string> = {
  channel: "Channel",
  provider: "Provider",
  capability: "Capability",
};
