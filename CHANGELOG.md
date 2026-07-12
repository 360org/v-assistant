# Changelog

All notable changes to V Assistant are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions use
[SemVer](https://semver.org/).

## [Unreleased]

The app now runs its agent engine **in-app** — install, sign in, and use.
No Docker, no separate engine, no configuration.

### Added
- **Agents act using the Vault.** An in-app tool-calling loop lets agents run
  real tools: `vault_list` (discover stored logins — names and field names
  only, never secret values) and `http_request` (perform actions such as
  posting to a blog or calling an API). Secrets are referenced by placeholder
  `{{vault:Name.field}}` and substituted locally, so passwords and keys never
  enter the model. Verified end-to-end (`scripts/tool-loop-check.mjs`).
- **Telegram, 2-way, in-app.** Paste the @BotFather token and message the bot;
  it replies using the same assistant (provider + agent + Vault tools). The
  channel reads the token from the Vault, long-polls Telegram, and starts and
  stops with the integration. Provider/agent switches take effect live.
  Verified end-to-end (`scripts/telegram-check.mjs`).
- **Scheduled tasks that actually run.** A once-a-minute tick runs every due,
  enabled task through the assistant and delivers the result to chat and (when
  connected) to Telegram. Recognises daily / weekday / named-day / hourly /
  monthly schedules with an "at HH:MM" time. Verified
  (`scripts/schedule-check.mjs`).
- **CI coverage** for all of the above, plus the direct sign-in logic
  (`scripts/login-check.mjs`): code→key exchange with PKCE (S256), each vendor
  routing to the right models, and local-user creation.

- **Isolated switchable roles.** Knowledge and memory are now per-role: pick
  Sales Expert and you get Sales' knowledge; switch to Marketing and it swaps
  cleanly with no bleed. Switching is instant (pure state, no boot). Verified
  (`scripts/isolation-check.mjs`).
- **Self-improving memory (Hermes-style).** After each exchange a role reflects
  and saves durable facts about the user to its own memory (deduped, capped);
  toggle in Settings. Verified (`scripts/self-improve-check.mjs`).
- **Optional WASM code sandbox** (`sandbox` Cargo feature, off by default so
  the app stays light and starts instantly). Guest code runs with no host
  imports, a memory ceiling and a fuel budget — a runaway or hostile guest is
  trapped, never harming the host. Verified (`examples/sandbox_check`).

### Changed
- The engine is now described as embedded and always-on; an external NanoClaw
  host is an optional advanced attachment, not a requirement for normal use.

### Known / not yet automated
- The live OAuth redirect and openrouter.ai round-trip still need a manual
  check on a real desktop (CI has no browser). The sign-in *logic* around it
  is covered by `scripts/login-check.mjs`.
- Advanced items remain planned: Knowledge extraction/RAG, self-improving
  agents, and OAuth integrations (Drive/Outlook/Calendar).

## [0.1.0] — 2026-07-11

First installable release for macOS, Windows and Linux.

### Added
- **Onboarding & sign-in:** login-first flow with one-click "Continue with
  ChatGPT / Claude / Gemini / OpenRouter" via OpenRouter PKCE OAuth (no API
  key needed); API key available under Advanced options. First sign-in
  auto-creates the local user from the vendor account.
- **AI providers:** real streaming chat over Anthropic, Google Gemini and
  OpenAI-compatible APIs (OpenRouter / OpenAI / local servers); one-click
  provider switching.
- **Credential Vault:** secrets stored in the OS keychain on desktop; entries
  with default and typed custom fields (text, password, number, URL, email,
  date, date & time) with matching icons.
- **Skills:** built-in, spec-compliant [Agent Skills](https://agentskills.io);
  install any skill from a URL; the active skill's instructions steer the chat.
  NanoClaw engine-skills catalog (channels/providers/capabilities).
- **Agents:** installable agent store; per-agent Instructions, Soul and
  Memory, injected into the system prompt.
- **Knowledge, Integrations, Scheduled tasks, Settings** pages; Telegram
  bot-token configuration; responsive layout; brand logo and app icons.
- **Desktop shell (Tauri):** loopback OAuth, OS-keychain Vault, runtime
  service; CI (frontend + Rust) and a release workflow producing installers
  for macOS (arm64/x64), Windows and Linux.
