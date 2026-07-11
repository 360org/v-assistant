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

## Sign-in & Credential Vault

Every "Continue with …" is a real one-click login through the router
(OpenRouter-style PKCE OAuth): the chosen vendor decides which models the
account is pointed at (ChatGPT → `openai/*`, Claude → `anthropic/*`,
Gemini → `google/*`), so one login reaches that vendor's models with no
API key. First sign-in auto-creates the local user from the vendor account.

How the redirect is handled depends on where the app runs:

- **Desktop (Tauri)** — real OAuth via **loopback**: the native side opens a
  throwaway `http://127.0.0.1:<port>` listener (`oauth_listen`) and the
  system browser (`open_external`); after the user logs in, the browser
  redirects to the loopback, the app reads the code and exchanges it for a
  key — all without leaving the app. This is the production sign-in.
- **Web (hosted on https)** — real OAuth via full-page redirect back to the
  page URL.
- **Demo build** (`VITE_DEMO=1`) — the round-trip is simulated in place, so
  the UX is visible where real OAuth/network is unavailable.

**Credential Vault.** The obtained key never sits in plaintext or in the
UI. On the desktop it lives in the OS secret store — macOS Keychain,
Windows Credential Manager, or the Linux Secret Service — via the `keyring`
crate (`vault_set` / `vault_get` / `vault_delete`,
`src-tauri/src/vault.rs`), mirroring NanoClaw's **Agent Vault**. The app
persists only non-secret metadata; the key is stripped before anything is
written to local storage and rehydrated from the Vault on start
(`src/runtime/vault.ts`). On the web it falls back to a namespaced
`localStorage`; Settings → Account shows which is in effect. An API key
remains available under **Advanced options** as a fallback.

## Development

Prerequisites: [Node.js 20+](https://nodejs.org) and, for the desktop shell,
the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
(Rust + platform toolchain).

```bash
npm install

# Web preview (UI only, runs in the browser)
npm run dev

# Desktop app with REAL login + Vault (Tauri window)
npm run tauri dev

# Production desktop build — installer/bundle per platform (.exe/.dmg/.deb)
npm run tauri build
```

Verify the desktop OAuth loopback without a GUI:

```bash
cd src-tauri && cargo run --example oauth_loopback_check
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
