/**
 * Connectors — credential-aware plugins that let an agent operate other
 * systems using logins stored in the Vault.
 *
 * When the user connects an integration (Integrations page), its credential is
 * saved to the Vault. A connector wraps that: the agent calls it by name and
 * the connector fetches the credential from the Vault and applies the right
 * authentication for that system automatically — the agent never handles the
 * raw token or wires auth headers by hand.
 */

import { findVaultEntry, isSecretField, type VaultEntry } from "./vault";

/** Per-system base URL + how its stored token becomes an authenticated call. */
interface ConnectorProfile {
  /** API base; the agent may pass just a path. */
  base: string;
  /** Build the final URL + headers from the token and the agent's path/url. */
  apply(token: string, target: string): { url: string; headers: Record<string, string> };
}

function absolute(base: string, target: string): string {
  return /^https?:\/\//i.test(target) ? target : base + (target.startsWith("/") ? target : `/${target}`);
}

export const CONNECTORS: Record<string, ConnectorProfile> = {
  github: {
    base: "https://api.github.com",
    apply: (t, u) => ({
      url: absolute("https://api.github.com", u),
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "V-Assistant",
      },
    }),
  },
  notion: {
    base: "https://api.notion.com/v1",
    apply: (t, u) => ({
      url: absolute("https://api.notion.com/v1", u),
      headers: { Authorization: `Bearer ${t}`, "Notion-Version": "2022-06-28" },
    }),
  },
  slack: {
    base: "https://slack.com/api",
    apply: (t, u) => ({
      url: absolute("https://slack.com/api", u),
      headers: { Authorization: `Bearer ${t}` },
    }),
  },
  discord: {
    base: "https://discord.com/api",
    apply: (t, u) => ({
      url: absolute("https://discord.com/api", u),
      headers: { Authorization: `Bot ${t}` },
    }),
  },
  telegram: {
    // Telegram carries the token in the path: /bot<token>/<method>.
    base: "https://api.telegram.org",
    apply: (t, u) => {
      const method = u.replace(/^https?:\/\/[^/]+/i, "").replace(/^\//, "");
      return { url: `https://api.telegram.org/bot${t}/${method}`, headers: {} };
    },
  },
};

/** Pull the credential/token out of an integration's Vault entry. */
export function connectorToken(entry: VaultEntry): string | undefined {
  const secret = entry.fields?.find(
    (f) => isSecretField(f) || /token|key|secret|pat/i.test(f.label),
  );
  return secret?.value || entry.password || entry.fields?.[0]?.value;
}

export interface ConnectorCall {
  connector: string;
  method?: string;
  target: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ConnectorResult {
  ok: boolean;
  status?: number;
  body: string;
}

/**
 * Run a request through a connector: look up its Vault credential, apply the
 * system's auth, and call it. The token never passes through the model.
 */
export async function callConnector(call: ConnectorCall): Promise<ConnectorResult> {
  const name = call.connector.trim().toLowerCase();
  const entry = await findVaultEntry(name);
  if (!entry) {
    return { ok: false, body: `No "${name}" connection found. Connect it on the Integrations page first.` };
  }
  const token = connectorToken(entry);
  if (!token) {
    return { ok: false, body: `The "${name}" connection has no stored credential.` };
  }
  const profile = CONNECTORS[name];
  const { url, headers } = profile
    ? profile.apply(token, call.target)
    : // Generic fallback: bearer auth against the given absolute URL.
      { url: call.target, headers: { Authorization: `Bearer ${token}` } };

  const method = (call.method ?? "GET").toUpperCase();
  try {
    const res = await fetch(url, {
      method,
      headers: { ...headers, ...(call.headers ?? {}) },
      body: method === "GET" || method === "HEAD" ? undefined : call.body,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: text.length > 4000 ? text.slice(0, 4000) + "…[truncated]" : text,
    };
  } catch (e) {
    return { ok: false, body: `Connector request failed: ${e instanceof Error ? e.message : e}` };
  }
}
