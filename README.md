# V Assistant

**AI for everyone — install in 2 minutes, use immediately.**

> Download → Install → Login → Connect → Start AI

V Assistant is a desktop AI assistant for everyday people. No configuration,
no terminal, no Docker, no API keys (when the provider supports OAuth). The
user only sees: **Chat, Agents, Knowledge, Integrations** — everything else
runs in the background.

## Features

- **2-minute onboarding** — sign in with the AI account you already have
  (ChatGPT, Claude, Gemini, OpenRouter, or Local AI), optionally connect an
  app, start chatting.
- **Chat** — a clean, familiar chat with streaming replies. Switch AI
  provider with one click, at any time.
- **Agent Store** — ready-made experts (ERP, Sales, Marketing, SEO, Customer
  Care, HR, Accounting, Legal, …). One click to install, ready to chat.
- **Knowledge** — drag & drop PDF, Word, Excel, PowerPoint or folders. The
  runtime handles processing automatically; the user never sees indexing,
  embeddings or vector stores.
- **Integrations** — one **Connect** button per service: Telegram, GitHub,
  Google Drive, Outlook, Slack, Discord, Notion, Google Calendar.

## Tech stack

| Layer   | Choice                                                |
| ------- | ----------------------------------------------------- |
| Desktop | [Tauri 2](https://v2.tauri.app) (Windows/macOS/Linux) |
| UI      | React + TailwindCSS + shadcn-style components + Framer Motion |
| Core    | AI Runtime Service (`src/runtime/engine.ts` ↔ `src-tauri/src/lib.rs`) |

### Architecture

```
+-----------------------------------+
|         V Assistant Desktop       |
|-----------------------------------|
| React UI                          |
| Tauri                             |
+-------------------+---------------+
                    |
           AI Runtime Service
                    |
      +-------------+-------------+
      |             |             |
 GPT/Claude     Telegram      Knowledge
 Gemini         WhatsApp      Files
      |
   Agent Runtime
```

The UI talks only to the **AI Runtime Service**. The engine behind it is an
implementation detail and is never surfaced to the user. The current build
ships a local demo engine so every flow (onboarding, streaming chat, provider
switching, agent install, knowledge processing, integration connect) is fully
navigable offline; wiring real providers means replacing `createEngine()` in
`src/runtime/engine.ts` — no UI changes.

## Development

Prerequisites: [Node.js 20+](https://nodejs.org) and, for the desktop shell,
the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
(Rust + platform toolchain).

```bash
npm install

# Web preview (UI only, runs in the browser)
npm run dev

# Desktop app (Tauri window)
npm run tauri dev

# Production desktop build (installer/bundle per platform)
npm run tauri build
```

## Project layout

```
src/                  React UI
  pages/              Home, Chat, Agents, Skills, Knowledge, Integrations, Settings
  components/         Sidebar + shadcn-style UI primitives
  lib/                App store (persisted), catalogs, skills loader, utils
  runtime/            AI Runtime Service boundary (engine interface + demo engine)
skills/               Agent Skills (one directory per skill, see below)
src-tauri/            Tauri 2 shell (Rust)
```

## Skills

Every skill in the app is a standard [Agent Skills](https://agentskills.io)
directory under `skills/<name>/SKILL.md`: YAML frontmatter with the
spec-required `name` and `description`, app display fields under `metadata`
(`vua-`-prefixed keys), and a markdown body with the instructions the engine
follows when the skill runs. The UI loads them at build time
(`src/lib/skills.ts`) — adding a skill is adding a folder, no code changes.

```bash
npm run validate:skills   # checks every skill against the Agent Skills spec
```

Validation also runs automatically as part of `npm run build`.

## Product principle

> If someone who has never used AI can download, install and start using it
> in under 2 minutes without reading any documentation, we've met the bar.

## Author

**360org** · [vuaai.net](https://vuaai.net) · [support@vuaai.net](mailto:support@vuaai.net)
