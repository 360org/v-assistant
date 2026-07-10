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
  /** Providers with OAuth need no API key — the "Continue with …" path. */
  oauth: boolean;
}

export const PROVIDERS: Provider[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    loginLabel: "Continue with ChatGPT",
    tagline: "OpenAI GPT models",
    oauth: true,
  },
  {
    id: "claude",
    name: "Claude",
    loginLabel: "Continue with Claude",
    tagline: "Anthropic Claude models",
    oauth: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    loginLabel: "Continue with Gemini",
    tagline: "Google Gemini models",
    oauth: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    loginLabel: "Continue with OpenRouter",
    tagline: "Hundreds of models, one account",
    oauth: true,
  },
  {
    id: "local",
    name: "Local AI",
    loginLabel: "Use Local AI",
    tagline: "Runs entirely on this computer",
    oauth: false,
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

export interface SkillTemplate {
  id: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  /** Pre-filled into the chat composer when the user clicks Use. */
  prompt: string;
}

export const SKILLS: SkillTemplate[] = [
  {
    id: "write-email",
    name: "Write Email",
    emoji: "✉️",
    category: "Office",
    description: "Turn a few bullet points into a polished, professional email.",
    prompt: "Write a professional email about: ",
  },
  {
    id: "summarize",
    name: "Summarize Document",
    emoji: "📄",
    category: "Office",
    description: "Get the key points of any long text or document in seconds.",
    prompt: "Summarize the key points of the following document:\n\n",
  },
  {
    id: "translate",
    name: "Translate",
    emoji: "🌐",
    category: "Language",
    description: "Translate between Vietnamese, English and 100+ languages.",
    prompt: "Translate the following text to Vietnamese:\n\n",
  },
  {
    id: "excel-formula",
    name: "Excel Formula",
    emoji: "📊",
    category: "Office",
    description: "Describe what you need and get the exact Excel formula.",
    prompt: "Write an Excel formula that: ",
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    emoji: "📝",
    category: "Office",
    description: "Turn a rough transcript into clean minutes with action items.",
    prompt:
      "Turn these meeting notes into clean minutes with action items:\n\n",
  },
  {
    id: "report-writer",
    name: "Write Report",
    emoji: "📈",
    category: "Business",
    description: "Draft a structured business report from your raw data.",
    prompt: "Write a structured business report about: ",
  },
  {
    id: "social-post",
    name: "Social Media Post",
    emoji: "📣",
    category: "Marketing",
    description: "Catchy posts for Facebook, LinkedIn or TikTok in your voice.",
    prompt: "Write an engaging social media post about: ",
  },
  {
    id: "brainstorm",
    name: "Brainstorm Ideas",
    emoji: "💡",
    category: "Creative",
    description: "Generate fresh ideas for any topic, product or campaign.",
    prompt: "Brainstorm 10 creative ideas for: ",
  },
  {
    id: "fix-writing",
    name: "Improve Writing",
    emoji: "✨",
    category: "Language",
    description: "Fix grammar and make any text clearer and more natural.",
    prompt: "Improve the grammar, clarity and tone of this text:\n\n",
  },
  {
    id: "explain",
    name: "Explain Simply",
    emoji: "🎓",
    category: "Learning",
    description: "Understand any complex topic, explained in plain language.",
    prompt: "Explain in simple terms: ",
  },
];

export interface Integration {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Shown during onboarding step 3. */
  featured: boolean;
}

export const INTEGRATIONS: Integration[] = [
  {
    id: "telegram",
    name: "Telegram",
    emoji: "✈️",
    description: "Chat with your assistant from Telegram, anywhere.",
    featured: true,
  },
  {
    id: "github",
    name: "GitHub",
    emoji: "🐙",
    description: "Let agents read repositories and open pull requests.",
    featured: false,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    emoji: "📁",
    description: "Use your Drive documents as knowledge.",
    featured: true,
  },
  {
    id: "outlook",
    name: "Outlook",
    emoji: "📧",
    description: "Draft, summarize and search your email.",
    featured: false,
  },
  {
    id: "slack",
    name: "Slack",
    emoji: "💼",
    description: "Bring the assistant into your team channels.",
    featured: false,
  },
  {
    id: "discord",
    name: "Discord",
    emoji: "🎮",
    description: "Add the assistant to your Discord server.",
    featured: false,
  },
  {
    id: "notion",
    name: "Notion",
    emoji: "📓",
    description: "Search and write to your Notion workspace.",
    featured: false,
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    emoji: "📅",
    description: "Schedule meetings and get daily briefings.",
    featured: false,
  },
];
