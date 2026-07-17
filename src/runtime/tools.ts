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
 *   - `connector_request` — the agent sends only an opaque Vault reference
 *                     and `{{credential:<field>}}` variables. Tauri and AI
 *                     Router resolve them outside the model context.
 */

import {
  listVaultEntries,
  findVaultEntry,
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

const vaultListTool: AgentTool = {
  schema: {
    type: "function",
    function: {
      name: "vault_list",
      description:
        "List the credentials the user has stored in their Vault (site " +
        "logins, API keys, endpoints). Returns each entry's name, service " +
        "and opaque references — never secret values. Use a field in " +
        "connector_request as {{credential:field}}.",
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
      if (entry.username) fields.push("username");
      if (entry.password) fields.push("password");
      for (const f of entry.fields ?? []) {
        fields.push(f.label);
      }
      entries.push({
        ref: `vault-entry:${entry.id}`,
        label: entry.label,
        service: entry.service ?? null,
        variables: fields.map((field) => `{{credential:${field}}}`),
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
        "Perform an unauthenticated HTTP request. Credentialed requests must " +
        "use connector_request so Vault values stay outside agent context.",
      parameters: {
        type: "object",
        properties: {
          method: {
            type: "string",
            description: "HTTP method, e.g. GET, POST, PUT, DELETE.",
          },
          url: {
            type: "string",
            description: "Full absolute URL.",
          },
          headers: {
            type: "object",
            description: "Non-credential request headers.",
            additionalProperties: { type: "string" },
          },
          body: {
            type: "string",
            description: "Request body as a string. Omit for GET.",
          },
        },
        required: ["method", "url"],
      },
    },
  },
  async run(args) {
    const method = String(args.method ?? "GET").toUpperCase();
    const url = String(args.url ?? "");
    if (!/^https?:\/\//i.test(url)) {
      return "Error: url must be an absolute http(s) URL.";
    }
    const headers = (args.headers ?? {}) as Record<string, string>;
    const body = args.body != null ? String(args.body) : undefined;
    const serialized = JSON.stringify({ url, headers, body });
    if (
      Object.keys(headers).some((key) => /authorization|cookie|x-api-key/i.test(key)) ||
      /\{\{credential:|\{\{vault:|password|bearer\s|access[_-]?token|api[_-]?key/i.test(serialized)
    ) {
      return "Credential access denied. Use connector_request with an opaque Vault reference.";
    }
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

const connectorRequestTool: AgentTool = {
  schema: {
    type: "function",
    function: {
      name: "connector_request",
      description:
        "Call the origin bound to an opaque Vault reference. Put " +
        "{{credential:field}} variables in headers or body; the trusted " +
        "gateway resolves and redacts them outside your context.",
      parameters: {
        type: "object",
        properties: {
          credential_ref: {
            type: "string",
            description: "Opaque ref returned by vault_list.",
          },
          method: { type: "string", description: "HTTP method (default GET)." },
          url: {
            type: "string",
            description: "Path or URL on the Vault entry's saved origin.",
          },
          headers: { type: "object", additionalProperties: { type: "string" } },
          body: { type: "string", description: "Request body (JSON), if any." },
        },
        required: ["credential_ref", "url"],
      },
    },
  },
  async run(args) {
    if (!(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window)) {
      return "Connector gateway is available only in V Assistant Desktop.";
    }
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = JSON.stringify({
      credentialRef: String(args.credential_ref ?? ""),
      url: String(args.url ?? ""),
      method: args.method ? String(args.method) : "GET",
      headers: args.headers ?? {},
      body: args.body != null ? String(args.body) : undefined,
    });
    const raw = await invoke<string>("runtime_connector_request", { payload });
    const result = JSON.parse(raw) as { status?: number; body?: string; error?: string };
    if (result.error) return `Connector error: ${result.error}`;
    return `HTTP ${result.status ?? 0}\n${result.body ?? ""}`;
  },
};

/** The tools every agent turn can use. */
export function buildAgentTools(): AgentTool[] {
  return [vaultListTool, httpRequestTool, connectorRequestTool];
}
