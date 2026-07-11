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
- [x] Desktop: real loopback OAuth (native listener + system browser)
- [x] Web (hosted https): real PKCE redirect
- [x] Demo build: simulated round-trip (sandbox has no OAuth/network)
- [x] First sign-in auto-creates the local user from the vendor account
- [x] API key available under **Advanced options** as fallback
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
- [ ] Agents actually pull credentials from the Vault to run tools 🟡 → see §9

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
- [ ] **Self-improving**: learn from interactions (Hermes-style) ⬜
- [ ] Agents read the Vault to perform real tool actions ⬜ → see §9

## 6. Knowledge

- [x] Drag & drop files; Processing → Ready status UI
- [ ] Real extraction (PDF/Word/Excel) → chunks ⬜
- [ ] Retrieval fed into chat as context (RAG) ⬜

## 7. Integrations (channels)

- [x] Token-based config dialog → Vault (Telegram, GitHub, Slack, Discord, Notion)
- [x] Telegram: bot token (+ chat id) captured and stored
- [ ] OAuth integrations (Drive, Outlook, Calendar) real login ⬜
- [ ] Channel actually runs via the engine (send/receive) ⬜ → see §8

## 8. Telegram / channels — real run

- [x] Bot token stored in the Vault
- [ ] Engine reads the token and runs the Telegram channel ⬜
- [ ] Inbound message → agent reply → outbound (2-way), verified via
      engine-stub loopback (no Docker) ⬜

## 9. Vault ↔ Agent actions

- [ ] Agent looks up a Vault entry by name during a task ⬜
- [ ] "Post this to my blog" → agent reads URL+login → calls a tool to post
      (mock endpoint) → verified end-to-end ⬜

## 10. Scheduled tasks

- [x] Menu + page: create task (name, instruction, schedule), pause/resume, delete
- [ ] Engine actually runs tasks on schedule and messages results back ⬜

## 11. NanoClaw runtime (engine boundary)

- [x] SQLite inbound/outbound IPC contract (`runtime.rs`) + Tauri commands
- [x] Per-agent groups + skills materialized for the engine
- [x] Engine attach via `VUA_ENGINE_DIR`; falls back to preview engine
- [x] Cross-process IPC verified (`examples/ipc_check`)
- [ ] Real NanoClaw checkout + Docker attached ⬜

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
