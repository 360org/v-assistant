/**
 * Agent tools — the real capabilities agents run inside the app.
 *
 * This is what makes V Assistant "just work" after install: no external
 * engine, no Docker. The agent loop (see `providers.ts`) calls these tools
 * directly. Two abilities cover the core promise "store a login once, the
 * agent uses it to act":
 *
 *   - `vault_list`  — the agent discovers what credentials exist (names and
 *                     field names only, never secret values).
 *   - `http_request`— the agent performs an action (post to a blog, call an
 *                     API). Secrets are referenced by placeholder
 *                     `{{vault:<name>.<field>}}` and substituted locally by
 *                     the executor, so passwords/keys never enter the model.
 */

import {
  listVaultEntries,
  findVaultEntry,
  readField,
  isSecretField,
} from "./vault";

/** An OpenAI-compatible tool the agent can call, plus its executor. */
export interface AgentTool {
  schema: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
  run(args: Record<string, unknown>): Promise<string>;
}

/** Fill `{{vault:Label.field}}` placeholders with real values from the Vault. */
async function resolveVaultPlaceholders(input: string): Promise<string> {
  const pattern = /\{\{\s*vault:([^.}]+)\.([^}]+?)\s*\}\}/g;
  const matches = [...input.matchAll(pattern)];
  if (matches.length === 0) return input;
  let out = input;
  for (const [token, rawLabel, rawField] of matches) {
    const entry = await findVaultEntry(rawLabel.trim());
    const value = entry ? readField(entry, rawField.trim()) : undefined;
    if (value !== undefined) out = out.split(token).join(value);
  }
  return out;
}

/** Recursively resolve placeholders inside any JSON-ish value. */
async function resolveDeep(value: unknown): Promise<unknown> {
  if (typeof value === "string") return resolveVaultPlaceholders(value);
  if (Array.isArray(value)) return Promise.all(value.map(resolveDeep));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await resolveDeep(v);
    return out;
  }
  return value;
}

const vaultListTool: AgentTool = {
  schema: {
    type: "function",
    function: {
      name: "vault_list",
      description:
        "List the credentials the user has stored in their Vault (site " +
        "logins, API keys, endpoints). Returns each entry's name, service " +
        "and the names of its fields — never the secret values. Use a " +
        "field in http_request by referencing it as {{vault:Name.field}}.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  async run() {
    const metas = await listVaultEntries();
    if (metas.length === 0) {
      return "The Vault is empty. Ask the user to add the login or API key in the Vault first.";
    }
    const entries = [];
    for (const meta of metas) {
      const entry = await findVaultEntry(meta.label);
      if (!entry) continue;
      const fields: string[] = [];
      if (entry.url) fields.push("url");
      if (entry.username) fields.push("username");
      if (entry.password) fields.push("password (secret)");
      for (const f of entry.fields ?? []) {
        fields.push(`${f.label}${isSecretField(f) ? " (secret)" : ""}`);
      }
      entries.push({
        name: entry.label,
        service: entry.service ?? null,
        fields,
      });
    }
    return JSON.stringify(entries);
  },
};

const httpRequestTool: AgentTool = {
  schema: {
    type: "function",
    function: {
      name: "http_request",
      description:
        "Perform an HTTP request to act on the user's behalf (e.g. publish " +
        "a blog post, call an API). To use a stored secret, put a " +
        "placeholder like {{vault:My WordPress.password}} in any header or " +
        "body value — it is replaced with the real value locally before " +
        "sending, so you never see the secret. Returns the response status " +
        "and body (truncated).",
      parameters: {
        type: "object",
        properties: {
          method: {
            type: "string",
            description: "HTTP method, e.g. GET, POST, PUT, DELETE.",
          },
          url: {
            type: "string",
            description:
              "Full URL. May contain a {{vault:Name.url}} placeholder.",
          },
          headers: {
            type: "object",
            description:
              "Request headers. Values may contain vault placeholders.",
            additionalProperties: { type: "string" },
          },
          body: {
            type: "string",
            description:
              "Request body as a string (JSON or form). May contain vault " +
              "placeholders. Omit for GET.",
          },
        },
        required: ["method", "url"],
      },
    },
  },
  async run(args) {
    const method = String(args.method ?? "GET").toUpperCase();
    const url = await resolveVaultPlaceholders(String(args.url ?? ""));
    if (!/^https?:\/\//i.test(url)) {
      return "Error: url must be an absolute http(s) URL.";
    }
    const headers = (await resolveDeep(args.headers ?? {})) as Record<
      string,
      string
    >;
    const body =
      args.body != null
        ? await resolveVaultPlaceholders(String(args.body))
        : undefined;
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : body,
      });
      const text = await response.text();
      const truncated =
        text.length > 4000 ? text.slice(0, 4000) + "…[truncated]" : text;
      return `HTTP ${response.status} ${response.statusText}\n${truncated}`;
    } catch (e) {
      return `Error: request failed (${e instanceof Error ? e.message : e}).`;
    }
  },
};

/** The tools every agent turn can use. */
export function buildAgentTools(): AgentTool[] {
  return [vaultListTool, httpRequestTool];
}
