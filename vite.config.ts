import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { readNanoClawSessions } from "./server/nanoclaw-sessions";

const appVersion = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).version;

function mergeNanoClawSessions(state: Record<string, any>): Record<string, any> {
  try {
    const remote = readNanoClawSessions();
    if (!remote.length) return state;
    const current = Array.isArray(state.chatSessions) ? state.chatSessions : [];
    const remoteIds = new Set(remote.map((session) => session.id));
    const synced = remote.map((session) => ({
      ...session,
      agentId: current.find((item: any) => item.id === session.id)?.agentId ?? state.activeAgentId ?? null,
    }));
    const chatSessions = [...synced, ...current.filter((item: any) => !remoteIds.has(item.id))]
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const active = synced.find((session) => session.id === state.activeSessionId);
    return { ...state, chatSessions, ...(active ? { messages: active.messages } : {}) };
  } catch {
    return state;
  }
}

// Vite config tuned for Tauri development.
// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  define: {
    __V_ASSISTANT_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "dev-server-sync-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlPath = req.url ? req.url.split("?")[0] : "";

          if (urlPath === "/api/nanoclaw/sessions" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            try {
              res.end(JSON.stringify({ sessions: readNanoClawSessions() }));
            } catch (error) {
              res.statusCode = 503;
              res.end(JSON.stringify({
                sessions: [],
                error: error instanceof Error ? error.message : "NanoClaw session store unavailable",
              }));
            }
            return;
          }

          if (urlPath === "/api/state" && req.method === "GET") {
            const statePath = path.resolve(".vua_state_dev.json");
            res.setHeader("Content-Type", "application/json");
            if (fs.existsSync(statePath)) {
              try {
                const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
                res.end(JSON.stringify(mergeNanoClawSessions(state)));
              } catch {
                res.end(JSON.stringify({}));
              }
            } else {
              res.end(JSON.stringify({}));
            }
            return;
          }

          if (urlPath === "/api/state" && req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
            });
            req.on("end", () => {
              const statePath = path.resolve(".vua_state_dev.json");
              let shouldWrite = true;
              if (fs.existsSync(statePath)) {
                try {
                  const currentState = JSON.parse(fs.readFileSync(statePath, "utf-8"));
                  const newState = JSON.parse(body);
                  
                  // Safety checks:
                  // 1. If server has onboarded=true but incoming is not onboarded, do not overwrite.
                  if (currentState.onboarded && !newState.onboarded) {
                    shouldWrite = false;
                  }
                  // 2. If incoming has no providerConfigs (empty) but server has configured providers, do not overwrite.
                  const currentConfigsCount = Object.keys(currentState.providerConfigs || {}).length;
                  const newConfigsCount = Object.keys(newState.providerConfigs || {}).length;
                  if (currentConfigsCount > 0 && newConfigsCount === 0) {
                    shouldWrite = false;
                  }
                } catch {
                  // If parsing fails, fall back to writing.
                }
              }
              
              if (shouldWrite) {
                fs.writeFileSync(statePath, body, "utf-8");
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, preserved: !shouldWrite }));
            });
            return;
          }

          if (urlPath === "/api/vault" && req.method === "GET") {
            const url = new URL(req.url!, `http://${req.headers.host || "localhost"}`);
            const key = url.searchParams.get("key");
            const vaultPath = path.resolve(".vua_vault_dev.json");
            let vault: Record<string, string> = {};
            if (fs.existsSync(vaultPath)) {
              try {
                vault = JSON.parse(fs.readFileSync(vaultPath, "utf-8"));
              } catch {}
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ value: key ? (vault[key] || null) : null }));
            return;
          }

          if (urlPath === "/api/vault" && req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
            });
            req.on("end", () => {
              const vaultPath = path.resolve(".vua_vault_dev.json");
              let vault: Record<string, string> = {};
              if (fs.existsSync(vaultPath)) {
                try {
                  vault = JSON.parse(fs.readFileSync(vaultPath, "utf-8"));
                } catch {}
              }
              try {
                const { key, value } = JSON.parse(body);
                if (key) {
                  if (value === null) {
                    delete vault[key];
                  } else {
                    vault[key] = value;
                  }
                  fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), "utf-8");
                }
              } catch {}
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true }));
            });
            return;
          }

          next();
        });
      },
    },
  ],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Prevent Vite from obscuring Rust errors.
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if it is taken.
    port: 1420,
    strictPort: true,
    // Serve index.html for all routes (SPA) — needed for /callback popup route.
    fs: { strict: false },
    // Proxy AI provider APIs to avoid CORS issues in browser dev mode.
    // In production (Tauri desktop shell), requests go directly from the
    // webview which has no CORS restrictions.
    proxy: {
      "/proxy/anthropic": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/anthropic/, ""),
        secure: true,
        // Browsers attach Origin to same-origin POSTs too. Anthropic treats an
        // inbound Origin as a browser CORS call and rejects it with 401 when the
        // org disables CORS ("CORS requests are not allowed for this
        // Organization"). This request leaves from the dev server, not the page,
        // so drop the browser-only headers before forwarding.
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
            proxyReq.removeHeader("sec-fetch-mode");
            proxyReq.removeHeader("sec-fetch-site");
            proxyReq.removeHeader("sec-fetch-dest");
          });
        },
      },
      "/proxy/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/openai/, ""),
        secure: true,
      },
      "/proxy/openai-auth": {
        target: "https://auth.openai.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/openai-auth/, ""),
        secure: true,
      },
      "/proxy/gemini": {
        target: "https://generativelanguage.googleapis.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/gemini/, ""),
        secure: true,
      },
      "/proxy/antigravity": {
        target: "https://cloudcode-pa.googleapis.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/antigravity/, ""),
        secure: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("User-Agent", "antigravity/ide/2.1.1 darwin/arm64");
            proxyReq.removeHeader("origin");
          });
        },
      },
      "/proxy/openrouter": {
        target: "https://openrouter.ai",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/openrouter/, ""),
        secure: true,
      },
      "/proxy/claude-auth": {
        target: "https://claude.ai",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/claude-auth/, ""),
        secure: true,
      },
      "/proxy/google-oauth": {
        target: "https://oauth2.googleapis.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/google-oauth/, ""),
        secure: true,
      },
      "/proxy/google-auth": {
        target: "https://accounts.google.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/proxy\/google-auth/, ""),
        secure: true,
      },
    },
    watch: {
      // Don't watch the Rust side of the app or temporary dev state/vault files.
      ignored: [
        "**/src-tauri/**",
        "**/.vua_state_dev.json",
        "**/.vua_vault_dev.json",
      ],
      // Poll when running in Docker (bind mounts don't emit fs events on
      // macOS/Windows). Enabled via the dev compose's CHOKIDAR_USEPOLLING.
      usePolling: Boolean(process.env.CHOKIDAR_USEPOLLING),
    },
  },
  // Env variables starting with TAURI_ENV_* are exposed for platform-specific builds.
  envPrefix: ["VITE_", "TAURI_ENV_"],
});
