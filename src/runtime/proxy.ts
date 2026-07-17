/**
 * Dev-mode proxy helper — routes vendor API calls through Vite's proxy
 * so CORS is never an issue when running in the browser.
 *
 * In the Tauri desktop shell (or production) the raw URL is used directly
 * because webviews don't enforce same-origin restrictions.
 */

/** True when running inside the Tauri desktop shell (no CORS restrictions). */
export const inDesktopShell = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Map of vendor origins to local Vite proxy paths.
 * Each proxy path is configured in vite.config.ts and reverse-proxies to
 * the real vendor endpoint server-side.
 */
const PROXY_MAP: Record<string, string> = {
  "https://api.anthropic.com": "/proxy/anthropic",
  "https://api.openai.com": "/proxy/openai",
  "https://generativelanguage.googleapis.com": "/proxy/gemini",
  "https://cloudcode-pa.googleapis.com": "/proxy/antigravity",
  "https://openrouter.ai": "/proxy/openrouter",
  "https://auth.openai.com": "/proxy/openai-auth",
  "https://claude.ai": "/proxy/claude-auth",
  "https://oauth2.googleapis.com": "/proxy/google-oauth",
  "https://accounts.google.com": "/proxy/google-auth",
};

/**
 * Rewrite a vendor URL so it routes through Vite's dev proxy when running
 * in a plain browser. Returns the URL unchanged in Tauri or when no
 * matching proxy is configured.
 */
export function devUrl(url: string): string {
  if (inDesktopShell()) return url;
  for (const [origin, proxy] of Object.entries(PROXY_MAP)) {
    if (url.startsWith(origin)) {
      return proxy + url.slice(origin.length);
    }
  }
  return url;
}
