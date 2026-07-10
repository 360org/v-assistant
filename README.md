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
           AI Runtime Service        src-tauri/src/runtime.rs
                    |
        ipc/inbound.db · ipc/outbound.db   (SQLite queues, one writer each)
                    |
             NanoClaw Engine         host process + per-agent containers
                    |
      +-------------+-------------+
      |             |             |
 GPT/Claude     Telegram      Knowledge
 Gemini         WhatsApp      Files
```

The UI talks only to the **AI Runtime Service**. The engine behind it is
[NanoClaw](https://github.com/nanocoai/nanoclaw) — and it is an
implementation detail, never surfaced to the user. The desktop app speaks
NanoClaw's native channel contract, making V Assistant just another channel
alongside WhatsApp or Telegram:

- **Chat & Agents → NanoClaw groups.** Each installed agent is materialized
  as a `groups/<agent-id>/` folder with a generated `CLAUDE.md`; plain chat
  is the `main` group. Messages flow through the two SQLite queues
  (`runtime_send` / `runtime_receive` Tauri commands).
- **Skills → NanoClaw skills.** The `skills/` directory (standard Agent
  Skills format) is copied into the runtime dir for containers to mount.
- **Integrations → NanoClaw connector channels.** Telegram, WhatsApp,
  Discord, Slack etc. are NanoClaw channel modules; the Connect button is
  the front door to installing and pairing them.
- **Providers → engine credentials.** Keys live at the engine's proxy layer
  (Agent Vault), never in agent containers and never in the UI.

Point `VUA_ENGINE_DIR` at an engine entry script to attach a real engine
(`scripts/engine-stub.mjs` is a dev stand-in that echoes; a NanoClaw
checkout with the desktop channel is the real thing). Without an engine the
app silently falls back to the built-in preview engine, so every flow —
onboarding, streaming chat, provider switching, agent install, knowledge,
integrations — stays fully navigable offline. The seam can be exercised
end-to-end without Docker or credentials:

```bash
cd src-tauri
VUA_ENGINE_DIR=../scripts/engine-stub.mjs cargo run --example ipc_check
```

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
