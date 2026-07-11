/**
 * NanoClaw engine skills — the capabilities the engine can install on
 * demand (channel adapters, alternative providers, and built-in powers).
 * On the desktop these map to NanoClaw's `/add-<name>` skills; the app
 * surfaces them so the user installs capabilities without touching code.
 */

export type EngineSkillKind = "channel" | "provider" | "capability";

export interface EngineSkill {
  id: string;
  name: string;
  emoji: string;
  kind: EngineSkillKind;
  description: string;
  /** The NanoClaw command this maps to, e.g. "/add-telegram". */
  command: string;
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
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    emoji: "🟢",
    kind: "channel",
    description: "Message your assistant on WhatsApp.",
    command: "/add-whatsapp",
  },
  {
    id: "discord",
    name: "Discord",
    emoji: "🎮",
    kind: "channel",
    description: "Add the assistant to a Discord server.",
    command: "/add-discord",
  },
  {
    id: "slack",
    name: "Slack",
    emoji: "💼",
    kind: "channel",
    description: "Bring the assistant into Slack channels.",
    command: "/add-slack",
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
