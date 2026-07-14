/**
 * Static catalogs for the app: AI providers, Agent Store entries and
 * integrations. Everything the user can "one-click" lives here so the UI
 * stays declarative and the runtime stays swappable.
 */

export type ProviderId =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "openrouter"
  | "local";

export interface Provider {
  id: ProviderId;
  name: string;
  loginLabel: string;
  tagline: string;
  /** True when one-click direct sign-in (OAuth) is available today. */
  oauth: boolean;
  /** Where the user gets an API key. */
  keyUrl?: string;
  /** Short connect hint shown in the connect dialog. */
  hint?: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    loginLabel: "Continue with OpenRouter",
    tagline: "GPT, Claude, Gemini & hundreds more — one login",
    oauth: true,
    keyUrl: "https://openrouter.ai/keys",
    hint: "Sign in once and use GPT, Claude, Gemini, Llama and hundreds more.",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    loginLabel: "Continue with ChatGPT",
    tagline: "OpenAI GPT — API key or via OpenRouter",
    oauth: true,
    keyUrl: "https://platform.openai.com/api-keys",
    hint: "Direct ChatGPT sign-in coming soon. For now, paste your API key from platform.openai.com, or use 'Continue with OpenRouter' (already supports GPT-4o).",
  },
  {
    id: "claude",
    name: "Claude",
    loginLabel: "Continue with Claude",
    tagline: "Anthropic Claude — subscription login",
    oauth: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    hint: "Sign in via OAuth to use V-Assistant's subscription, or configure your own API key under Advanced options.",
  },
  {
    id: "gemini",
    name: "Gemini",
    loginLabel: "Continue with Gemini",
    tagline: "Google Gemini — subscription login",
    oauth: true,
    keyUrl: "https://aistudio.google.com/apikey",
    hint: "Sign in via OAuth to use V-Assistant's subscription, or configure your own API key under Advanced options.",
  },
{
    id: "local",
    name: "Local AI",
    loginLabel: "Use Local AI",
    tagline: "Runs entirely on this computer",
    oauth: false,
    hint: "Point at any OpenAI-compatible server — Ollama (http://localhost:11434/v1) or LM Studio.",
  },
];

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export interface AgentTemplate {
  id: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
}

export const AGENT_STORE: AgentTemplate[] = [
  {
    id: "erp-expert",
    name: "ERP Expert",
    emoji: "🏭",
    category: "Enterprise",
    description:
      "Understands your ERP data. Ask about inventory, orders, production and purchasing in plain language.",
  },
  {
    id: "sales-expert",
    name: "Sales Expert",
    emoji: "📈",
    category: "Business",
    description:
      "Drafts quotes and follow-ups, summarizes pipelines and helps you close deals faster.",
  },
  {
    id: "marketing-expert",
    name: "Marketing Expert",
    emoji: "📣",
    category: "Business",
    description:
      "Plans campaigns, writes copy for every channel and keeps your brand voice consistent.",
  },
  {
    id: "seo-expert",
    name: "SEO Expert",
    emoji: "🔍",
    category: "Business",
    description:
      "Keyword research, on-page audits and content briefs that actually rank.",
  },
  {
    id: "customer-care",
    name: "Customer Care",
    emoji: "💬",
    category: "Support",
    description:
      "Answers customer questions from your knowledge base, 24/7, in a friendly tone.",
  },
  {
    id: "hr-assistant",
    name: "HR Assistant",
    emoji: "🧑‍💼",
    category: "Office",
    description:
      "Job descriptions, onboarding checklists, policy answers and interview prep.",
  },
  {
    id: "accounting",
    name: "Accounting",
    emoji: "🧾",
    category: "Office",
    description:
      "Explains reports, drafts invoices and reminders, and helps with Excel formulas.",
  },
  {
    id: "legal",
    name: "Legal",
    emoji: "⚖️",
    category: "Office",
    description:
      "Reviews contracts, flags risky clauses and drafts everyday legal documents.",
  },
  {
    id: "email-writer",
    name: "Email Writer",
    emoji: "✉️",
    category: "Office",
    description:
      "Turns bullet points into polished emails and replies in your tone of voice.",
  },
  {
    id: "coding-agent",
    name: "Coding Agent",
    emoji: "👩‍💻",
    category: "Developer",
    description:
      "Reads your repositories, writes code, fixes bugs and reviews pull requests.",
  },
];

export interface IntegrationField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
}

export interface Integration {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Shown during onboarding step 3. */
  featured: boolean;
  /** How to reach it. `token` fields open a config form; `oauth` a login. */
  connect: "token" | "oauth";
  /** Config fields to collect (for `token` integrations). */
  fields?: IntegrationField[];
  /** Short how-to shown in the config dialog. */
  hint?: string;
}

export const INTEGRATIONS: Integration[] = [
  {
    id: "telegram",
    name: "Telegram",
    emoji: "✈️",
    description: "Chat with your assistant from Telegram, anywhere.",
    featured: true,
    connect: "token",
    hint: "Create a bot with @BotFather in Telegram, then paste the token it gives you.",
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
    id: "github",
    name: "GitHub",
    emoji: "🐙",
    description: "Let agents read repositories and open pull requests.",
    featured: false,
    connect: "token",
    hint: "Create a personal access token in GitHub → Settings → Developer settings.",
    fields: [
      {
        key: "token",
        label: "Personal access token",
        placeholder: "ghp_…",
        secret: true,
      },
    ],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    emoji: "📁",
    description: "Use your Drive documents as knowledge.",
    featured: true,
    connect: "oauth",
  },
  {
    id: "outlook",
    name: "Outlook",
    emoji: "📧",
    description: "Draft, summarize and search your email.",
    featured: false,
    connect: "oauth",
  },
  {
    id: "slack",
    name: "Slack",
    emoji: "💼",
    description: "Bring the assistant into your team channels.",
    featured: false,
    connect: "token",
    hint: "Create a Slack app and copy its Bot User OAuth Token.",
    fields: [
      { key: "token", label: "Bot token", placeholder: "xoxb-…", secret: true },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    emoji: "🎮",
    description: "Add the assistant to your Discord server.",
    featured: false,
    connect: "token",
    hint: "Create a bot in the Discord Developer Portal and copy its token.",
    fields: [
      { key: "token", label: "Bot token", placeholder: "Bot token", secret: true },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    emoji: "📓",
    description: "Search and write to your Notion workspace.",
    featured: false,
    connect: "token",
    hint: "Create an internal integration in Notion and copy its secret.",
    fields: [
      {
        key: "token",
        label: "Integration secret",
        placeholder: "secret_…",
        secret: true,
      },
    ],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    emoji: "📅",
    description: "Schedule meetings and get daily briefings.",
    featured: false,
    connect: "oauth",
  },
];
