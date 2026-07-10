---
name: verify
description: Build, launch and drive V Assistant to verify changes end-to-end.
---

# Verifying V Assistant

## Build

```bash
npm install
npm run build            # tsc + vite build — must pass
cd src-tauri && cargo check   # Rust shell; needs libgtk-3-dev + libwebkit2gtk-4.1-dev
```

On a bare Linux container install Tauri prerequisites first:
`apt-get update && apt-get install -y pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev`

## Launch (UI surface)

The whole product UI runs in the browser via Vite — no Tauri window needed
to verify UI changes:

```bash
npm run dev &            # serves http://localhost:1420 (strict port)
```

Drive with Playwright headless Chromium (globally installed; executable at
`/opt/pw-browsers/chromium-*/chrome-linux/chrome` in Claude remote envs —
import from `/opt/node22/lib/node_modules/playwright/index.mjs` since ESM
ignores NODE_PATH).

## Flows worth driving

1. Onboarding: Get started → "Continue with Claude" → toggle Telegram →
   Start chatting (lands on Chat).
2. Chat: fill composer, Enter → assistant reply streams (demo engine echoes
   with "preview response" text). Empty Enter must not send.
3. Provider switch: chat header dropdown; sidebar "Powered by X" updates.
4. Agents: Install on a card → button becomes Chat → click Chat → composer
   placeholder becomes "Ask your <Agent>…".
5. Skills: Use on a card → lands on Chat with the composer pre-filled and
   focused; navigating away and back must not re-fill it.
6. Knowledge: `setInputFiles` on the hidden `input[type=file]` → row shows
   Processing → Ready (~1–3s).
6. Integrations: Connect on a card → Connected badge.
7. Persistence probe: `page.reload()` → app skips onboarding (localStorage),
   chat history/agents/provider survive. App lands on Home after reload.

8. Responsive: at a mobile viewport (e.g. 390×844) the sidebar is replaced
   by a top bar; "Open menu" opens the drawer, picking an item or clicking
   the backdrop closes it, and `scrollWidth <= clientWidth` (no horizontal
   scroll). At ≥768px the sidebar returns and the top bar disappears.

## Gotchas

- Many labels are substrings of each other ("Chat" nav vs "Start a chat"
  card, provider name in header vs "Powered by X" sidebar) — always use
  `exact: true` on `getByRole` name matches.
- User message text is echoed inside the assistant reply, so `getByText` on
  the sent message resolves to 2 nodes — scope or use `.first()`.
- State lives in localStorage key `v-assistant-state-v1`; clear it (or
  Settings → Reset) to re-run onboarding.
