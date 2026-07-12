# V Assistant — Product Idea & Feature Checklist

> AI for everyone — download, install, login, connect, start. No config, no
> terminal, no API keys (when the provider supports it).

This is the single source of truth for what V Assistant is and where each
feature stands. Build **one feature to done at a time**; a feature is done
only when its checklist is fully ticked and verified in the running app.

**Status legend:** ✅ done & verified · 🟡 partial (UI/contract done, real
engine execution pending) · ⬜ planned/not started

---

## Vision & principles

- One place, the **Vault**, holds every credential (logins, API keys,
  endpoints). Agents read from it and act — the user never re-enters a login.
- **Skills** are standard [Agent Skills](https://agentskills.io) bundles.
- **Agents** are configurable personas (instructions + soul + memory) that
  can improve themselves over time.
- The engine is **NanoClaw** (channels, agent containers, scheduling); it is
  never surfaced in the UI.
- If a first-time user can install and start in under 2 minutes without docs,
  the experience bar is met.

---

## 1. Onboarding & Sign-in

- [x] Login-first screen — only "Continue with …" buttons, no API key field
- [x] One-click OAuth for every vendor via the router (ChatGPT→openai/*,
      Claude→anthropic/*, Gemini→google/*, OpenRouter→auto)
- [x] Desktop: real loopback OAuth (native listener + system browser);
      loopback contract verified (`examples/oauth_loopback_check`)
- [x] Web (hosted https): real PKCE redirect
- [x] Demo build: simulated round-trip (sandbox has no OAuth/network)
- [x] First sign-in auto-creates the local user from the vendor account
- [x] API key available under **Advanced options** as fallback
- [x] Sign-in logic verified (`scripts/login-check.mjs`, in CI): code→key
      exchange with PKCE (S256), each vendor routes to the right models
      (ChatGPT→openai, Claude→anthropic, Gemini→google, OpenRouter→auto),
      and the local user is created from the account
- [ ] Manual check still needed: the live OAuth redirect + openrouter.ai
      round-trip on a real desktop (can't run in CI — no browser) ⬜
- [ ] Native per-vendor OAuth (needs each vendor's OAuth app credentials) ⬜

## 2. AI Providers

- [x] Real streaming: Anthropic Messages, Google Gemini, OpenAI-compatible
      (OpenRouter / OpenAI / Ollama / Local AI)
- [x] Per-provider default model + model override
- [x] One-click provider switch (header + Settings)
- [x] Clean error bubbles; keys never leave the device except to the vendor
- [x] Engine selection per message: NanoClaw → provider → preview

## 3. Credential Vault

- [x] Secrets in OS keychain on desktop (`keyring`); namespaced localStorage on web
- [x] Provider tokens stored in the Vault, stripped from app storage
- [x] User-managed entries: default fields (Name, URL, Username, Password, Notes)
- [x] Dynamic custom fields with a type picker (Text, Password, Number, URL,
      Email, Date, Date & time); password masks with reveal
- [x] Field icons for default + custom fields
- [x] `findVaultEntry(label|service)` + `readField()` lookup for agents
- [x] Agents actually pull credentials from the Vault to run tools ✅ → see §9

## 4. Skills

- [x] Built-in task skills as spec-compliant Agent Skills (`skills/*/SKILL.md`)
- [x] Validation of skills against the Agent Skills spec (`validate-skills`)
- [x] Install any skill from a URL (fetch + parse + persist)
- [x] **Skills run for real** — the active skill's SKILL.md instructions are
      injected into the system prompt; header shows an active-skill chip
- [x] NanoClaw engine skills catalog (channels, providers, capabilities)
- [x] Channel/provider skills configure on install (token → Vault), e.g. Telegram
- [ ] Installed engine skills actually run (needs NanoClaw attached) ⬜

## 5. Agents  ← next feature

- [x] Agent Store: one-click install; installed agent → system-prompt persona
- [x] **Instructions**: per-agent workflow/process config (ChatGPT-style),
      injected into the system prompt — verified
- [x] **Soul**: personality/voice description that shapes replies — verified
- [x] Agent config screen (Configure dialog: Instructions + Soul)
- [x] **Memory**: persistent per-agent memory notes, injected into the
      system prompt so the agent recalls them across chats
- [x] **Self-improving** (Hermes-style): after each exchange a role reflects
      and saves durable facts to its **own** memory (deduped, capped); toggle
      in Settings. Verified (`scripts/self-improve-check.mjs`)
- [x] Agents read the Vault to perform real tool actions → see §9

## 6. Knowledge

- [x] Drag & drop files; Processing → Ready status UI
- [x] **Knowledge is isolated per role** — each agent (or the base assistant)
      has its own bucket; switching roles never mixes knowledge. The active
      role's documents are injected into its prompt only. Verified
      (`scripts/isolation-check.mjs`)
- [ ] Real extraction (PDF/Word/Excel) → chunks ⬜
- [ ] Retrieval fed into chat as context (RAG) ⬜

## 7. Integrations (channels)

- [x] Token-based config dialog → Vault (Telegram, GitHub, Slack, Discord, Notion)
- [x] Telegram: bot token (+ chat id) captured and stored
- [x] Telegram channel actually runs (send/receive) in-app → see §8
- [ ] OAuth integrations (Drive, Outlook, Calendar) real login ⬜

## 8. Telegram / channels — real run  ✅

- [x] Bot token stored in the Vault
- [x] In-app Telegram channel (`telegram.ts`): reads the token from the Vault
      and long-polls Telegram — no server, no Docker
- [x] Inbound message → embedded assistant (provider + agent + tools) →
      reply sent back (2-way). Verified end-to-end
      (`scripts/telegram-check.mjs`, runs in CI)
- [x] Starts/stops automatically with the Telegram integration; provider and
      agent switches take effect live

## 9. Vault ↔ Agent actions  ✅

- [x] In-app agent tool-calling loop (`tools.ts` + `providers.ts`) — no Docker
- [x] `vault_list` tool: agent discovers stored logins (names/fields, never
      secret values)
- [x] `http_request` tool: agent acts (post, call API); secrets referenced as
      `{{vault:Name.field}}` and substituted locally — never enter the model
- [x] "Post this to my blog" → agent reads the Vault → posts with the real
      secret → replies. Verified end-to-end (`scripts/tool-loop-check.mjs`,
      runs in CI)

## 10. Scheduled tasks  ✅

- [x] Menu + page: create task (name, instruction, schedule), pause/resume, delete
- [x] Schedule matcher (`schedule.ts`): daily/weekday/named-day/hourly/monthly
- [x] Runner (`scheduler.ts`) ticks each minute, runs due tasks through the
      embedded assistant, records `lastRun` so nothing double-fires
- [x] Results delivered to chat and pushed to Telegram when connected.
      Verified (`scripts/schedule-check.mjs`, runs in CI)

## 15. Multi-role runtime (isolation + optional sandbox)

Direction: keep the embedded engine — **instant start, light, safe**. No
parallel agents; instead, many **roles** you switch between, each with its own
isolated brain, plus an optional WASM sandbox for running agent code safely.

- [x] **Role isolation**: each role has its own memory + knowledge; the
      system prompt for a role carries only that role's context. Switching
      roles is instant (pure state, no boot) and never mixes knowledge.
      Verified (`scripts/isolation-check.mjs`)
- [x] **WASM code sandbox** (`src-tauri/src/sandbox.rs`, Wasmtime): guest code
      runs with no host imports, a memory ceiling and a fuel budget, so a
      runaway/hostile guest is trapped, not able to harm the host. Optional
      Cargo feature `sandbox` — **off by default to keep the build light**.
      Verified (`examples/sandbox_check`, runs in CI with `--features sandbox`)
- [ ] Per-role skill sets (each role loads only its own skills) ⬜
- [ ] Sandboxed file workspace per role (WASI preopen) ⬜
- [ ] MCP client for richer tools ⬜

## 11. Agent engine

The engine is **embedded in the app** — it runs the moment the app opens.
Chat, agents, skills and Vault-powered actions all execute in-app against the
provider APIs; the user never installs Docker or a separate engine.

- [x] Embedded provider engine: real streaming chat out of the box
- [x] In-app agent tool-calling (Vault lookup + HTTP actions) — see §9
- [x] SQLite inbound/outbound IPC contract (`runtime.rs`) + Tauri commands —
      the optional bridge to a heavier NanoClaw host for power users
- [x] Per-agent groups + skills materialized for that host
- [x] Cross-process IPC verified (`examples/ipc_check`)
- [ ] Optional: attach an external NanoClaw host via `VUA_ENGINE_DIR` for
      sandboxed containers (advanced; not needed for normal use) ⬜

## 12. Desktop app (Tauri)

- [x] Loopback OAuth (`auth.rs`) — verified (`examples/oauth_loopback_check`)
- [x] Vault via OS keychain (`vault.rs`)
- [x] Runtime + engine lifecycle
- [ ] End-to-end GUI run on a real desktop (needs a machine with a display) ⬜

## 13. UI / Navigation

- [x] Menu: Home, Chat, Agents, Skills, Knowledge, Vault, Scheduled, Integrations
- [x] Settings moved into the bottom user cluster
- [x] User profile shows name + "Powered by VuaAI.net"
- [x] Responsive (mobile drawer), brand logo, light/dark handled by app theme

## 14. Build & CI/CD

- [x] `npm run build` (validate-skills + tsc + vite) green
- [x] GitHub Actions CI (frontend + rust + loopback test) — verified green
- [x] Release workflow (macOS/Windows/Linux installers via tauri-action)
- [ ] Trigger a release build (push a `v*` tag or run from Actions on `main`) ⬜
- [ ] Live demo hosted on https for real OAuth (e.g. demo.vuaai.net) ⬜

---

## Working agreement

- Develop on `claude/v-assistant-desktop-abs2gw`, commit + push after each
  completed slice; **do not build installers until asked**.
- Every feature ships with a verification (drive the running app or a
  cross-process example), not just a green typecheck.
- Keep this file updated: tick items as they land; never silently drop scope.
