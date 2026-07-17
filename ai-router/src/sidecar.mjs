/**
 * V-Assistant AI Router. This is a first-party local service.
 *
 * The inherited Provider Core is source code under `core/open-sse`; no
 * upstream 9router process, dashboard, cookie, database, or HTTP endpoint is
 * started or contacted by this service.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import REGISTRY from "../core/open-sse/providers/registry/index.js";
import { handleChatCore } from "../core/open-sse/handlers/chatCore.js";
import {
  exchangeTokens,
  generateAuthData,
  getProvider,
  getProviderNames,
  pollForToken,
  requestDeviceCode,
} from "../core/src/lib/oauth/providers.js";

const host = process.env.AI_ROUTER_HOST || "127.0.0.1";
const port = Number(process.env.AI_ROUTER_PORT || 20128);
const statePath = process.env.AI_ROUTER_STATE_PATH || join(process.cwd(), ".vua_ai_router_connections.json");
const vaultPath = process.env.AI_ROUTER_VAULT_PATH || join(process.cwd(), ".vua_vault_dev.json");

function corsHeaders() {
  return {
    "access-control-allow-origin": `http://${host}:1420`,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
  };
}

function providerCatalog() {
  const oauthProviderNames = new Set(getProviderNames());
  return REGISTRY
    .map((entry) => ({
      id: entry.id,
      name: entry.display?.name || entry.id,
      oauth: Boolean(entry.oauth),
      oauthProvider: oauthProviderNames.has(entry.id) ? entry.id : undefined,
      apiKey: Boolean(entry.transport && (!entry.oauth || entry.category === "apiKey" || entry.category === "freeTier")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function oauthProviderCatalog() {
  return getProviderNames().map((id) => ({
    id,
    flowType: getProvider(id).flowType,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function readConnections() {
  try {
    const data = JSON.parse(readFileSync(statePath, "utf8"));
    const connections = Array.isArray(data.connections) ? data.connections : [];
    let migrated = false;
    const normalized = connections.map((connection) => {
      if (typeof connection?.id === "string" && !connection.credentialRef) {
        migrated = true;
        return { ...connection, credentialRef: `ai-router:credential:${connection.id}` };
      }
      return connection;
    });
    if (migrated) writeConnections(normalized);
    return normalized;
  } catch (error) {
    if (existsSync(statePath)) console.error(`[ai-router] could not read connection metadata: ${error.message}`);
    return [];
  }
}

function writeConnections(connections) {
  writeFileSync(statePath, JSON.stringify({ connections }, null, 2), { mode: 0o600 });
}

function modelsForConnections(connections) {
  return connections.flatMap((connection) => {
    // A saved credential is not evidence that the vendor can serve requests.
    // Chat only exposes models after the same Core path has passed a smoke test.
    if (connection.isActive === false || connection.testStatus !== "Verified") return [];
    const provider = REGISTRY.find((entry) => entry.id === connection.provider);
    if (!provider || !Array.isArray(provider.models)) return [];
    return provider.models
      .filter((model) => !model.kind || model.kind === "llm")
      .map((model) => ({
        id: `${provider.id}/${model.id}`,
        name: model.name || model.id,
        provider: provider.id,
      }));
  });
}

function findConnection(id) {
  return readConnections().find((connection) => connection.id === id);
}

function updateConnection(id, patch) {
  const connections = readConnections();
  const index = connections.findIndex((connection) => connection.id === id);
  if (index < 0) return null;
  const updated = { ...connections[index], ...patch };
  connections[index] = updated;
  writeConnections(connections);
  return updated;
}

function deleteConnection(id) {
  const connections = readConnections();
  const next = connections.filter((connection) => connection.id !== id);
  if (next.length === connections.length) return false;
  writeConnections(next);
  return true;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) request.destroy(new Error("Request body is too large"));
    });
    request.on("error", reject);
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid JSON request body")); }
    });
  });
}

function credentialsFromVault(connection) {
  const credentialRef = typeof connection.credentialRef === "string" ? connection.credentialRef : "";
  if (!credentialRef.startsWith("ai-router:credential:")) {
    throw new Error("AI Router connection has no valid Vault credential reference.");
  }
  let vault;
  try {
    vault = JSON.parse(readFileSync(vaultPath, "utf8"));
  } catch {
    throw new Error("AI Router Vault broker is unavailable.");
  }
  const raw = vault?.[credentialRef];
  let stored;
  try { stored = typeof raw === "string" ? JSON.parse(raw) : null; } catch { stored = null; }
  if (!stored || typeof stored !== "object") throw new Error("AI Router Vault credential is invalid.");
  return {
    connectionId: connection.id,
    connectionName: connection.id,
    accessToken: typeof stored.accessToken === "string" ? stored.accessToken : undefined,
    apiKey: typeof stored.apiKey === "string" ? stored.apiKey : undefined,
    refreshToken: typeof stored.refreshToken === "string" ? stored.refreshToken : undefined,
    projectId: typeof stored.projectId === "string" ? stored.projectId : undefined,
    expiresAt: typeof stored.expiresAt === "number" ? stored.expiresAt : undefined,
  };
}

function routerLog() {
  return {
    debug() {}, info() {}, warn() {}, error() {}, line() {}, errorLine() {},
    tagForSession() { return "local"; }, nextTag() { return "local"; },
  };
}

async function handleChat(request, response, input) {
  const modelId = typeof input.model === "string" ? input.model : "";
  const separator = modelId.indexOf("/");
  const provider = separator > 0 ? modelId.slice(0, separator) : "";
  const model = separator > 0 ? modelId.slice(separator + 1) : "";
  const connectionId = `${provider}:default`;
  const connection = readConnections().find((item) => item.id === connectionId && item.isActive !== false);
  if (!provider || !model || !connection) {
    sendJson(response, 400, { error: { message: "The selected model has no active AI Router connection." } });
    return;
  }
  try {
    const credentials = credentialsFromVault(connection);
    if (!credentials.accessToken && !credentials.apiKey) {
      sendJson(response, 401, { error: { message: "The selected AI Router connection has no credential." } });
      return;
    }
    const result = await handleChatCore({
      body: input,
      modelInfo: { provider, model },
      credentials,
      connectionId,
      apiKey: credentials.apiKey || credentials.accessToken,
      log: routerLog(),
      clientRawRequest: {
        endpoint: request.url || "/v1/chat/completions",
        body: input,
        headers: request.headers,
      },
    });
    const upstream = result?.response;
    if (!upstream) {
      sendJson(response, 502, { error: { message: result?.error || "AI Router received no provider response." } });
      return;
    }
    const headers = { ...corsHeaders() };
    upstream.headers.forEach((value, key) => { headers[key] = value; });
    response.writeHead(upstream.status, headers);
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(response);
    else response.end(await upstream.text());
  } catch (error) {
    sendJson(response, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
  }
}

async function testConnection(id) {
  const connection = findConnection(id);
  if (!connection) throw new Error("AI Router connection was not found.");
  const provider = REGISTRY.find((entry) => entry.id === connection.provider);
  const model = provider?.models?.find((item) => !item.kind || item.kind === "llm");
  if (!provider || !model) throw new Error("This provider has no testable language model in the AI Router registry.");

  try {
    const credentials = credentialsFromVault(connection);
    if (!credentials.accessToken && !credentials.apiKey) {
      throw new Error("The Vault credential does not contain an access token or API key.");
    }
    const body = {
      model: `${provider.id}/${model.id}`,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 16,
      stream: false,
    };
    const result = await handleChatCore({
      body,
      modelInfo: { provider: provider.id, model: model.id },
      credentials,
      connectionId: connection.id,
      apiKey: credentials.apiKey || credentials.accessToken,
      log: routerLog(),
      clientRawRequest: { endpoint: "/v1/providers/test", body, headers: {} },
    });
    const upstream = result?.response;
    if (!upstream) throw new Error(result?.error || "AI Router received no provider response.");
    const responseText = await upstream.text();
    if (!upstream.ok) {
      throw new Error(responseText.slice(0, 500) || `Provider returned HTTP ${upstream.status}.`);
    }
    const updated = updateConnection(connection.id, {
      testStatus: "Verified",
      lastError: undefined,
      lastTestedAt: new Date().toISOString(),
    });
    return { valid: true, connection: updated, model: `${provider.id}/${model.id}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateConnection(connection.id, {
      testStatus: "Failed",
      lastError: message,
      lastTestedAt: new Date().toISOString(),
    });
    throw new Error(message);
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { ...corsHeaders(), "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  if (url.pathname === "/health") {
    sendJson(response, 200, { ok: true, service: "ai-router", mode: "native-core", providerCore: "mounted", providerCount: providerCatalog().length });
    return;
  }
  if (url.pathname === "/v1/providers/catalog") {
    sendJson(response, 200, { providers: providerCatalog() });
    return;
  }
  if (url.pathname === "/v1/oauth/providers" && request.method === "GET") {
    sendJson(response, 200, { providers: oauthProviderCatalog() });
    return;
  }
  if (url.pathname === "/v1/oauth/authorize" && request.method === "POST") {
    void readJson(request).then(async (input) => {
      const provider = typeof input.provider === "string" ? input.provider : "";
      const redirectUri = typeof input.redirectUri === "string" ? input.redirectUri : "";
      if (!provider || !redirectUri) throw new Error("OAuth provider and redirect URI are required.");
      sendJson(response, 200, await generateAuthData(provider, redirectUri, input.meta));
    }).catch((error) => sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) }));
    return;
  }
  if (url.pathname === "/v1/oauth/exchange" && request.method === "POST") {
    void readJson(request).then(async (input) => {
      const provider = typeof input.provider === "string" ? input.provider : "";
      const code = typeof input.code === "string" ? input.code : "";
      const redirectUri = typeof input.redirectUri === "string" ? input.redirectUri : "";
      const verifier = typeof input.codeVerifier === "string" ? input.codeVerifier : "";
      const state = typeof input.state === "string" ? input.state : "";
      if (!provider || !code || !redirectUri) throw new Error("OAuth provider, callback code, and redirect URI are required.");
      sendJson(response, 200, { tokens: await exchangeTokens(provider, code, redirectUri, verifier, state, input.meta) });
    }).catch((error) => sendJson(response, 422, { error: error instanceof Error ? error.message : String(error) }));
    return;
  }
  if (url.pathname === "/v1/oauth/device/start" && request.method === "POST") {
    void readJson(request).then(async (input) => {
      const provider = typeof input.provider === "string" ? input.provider : "";
      const codeChallenge = typeof input.codeChallenge === "string" ? input.codeChallenge : "";
      if (!provider) throw new Error("OAuth provider is required.");
      sendJson(response, 200, { device: await requestDeviceCode(provider, codeChallenge, input.options) });
    }).catch((error) => sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) }));
    return;
  }
  if (url.pathname === "/v1/oauth/device/poll" && request.method === "POST") {
    void readJson(request).then(async (input) => {
      const provider = typeof input.provider === "string" ? input.provider : "";
      const deviceCode = typeof input.deviceCode === "string" ? input.deviceCode : "";
      const verifier = typeof input.codeVerifier === "string" ? input.codeVerifier : "";
      if (!provider || !deviceCode) throw new Error("OAuth provider and device code are required.");
      sendJson(response, 200, await pollForToken(provider, deviceCode, verifier, input.extraData));
    }).catch((error) => sendJson(response, 422, { error: error instanceof Error ? error.message : String(error) }));
    return;
  }
  if (url.pathname === "/v1/providers" && request.method === "GET") {
    sendJson(response, 200, { connections: readConnections() });
    return;
  }
  if (url.pathname === "/v1/providers" && request.method === "POST") {
    void readJson(request).then((input) => {
      const provider = typeof input.provider === "string" ? input.provider : "";
      const id = typeof input.id === "string" ? input.id : "";
      const authType = input.authType === "subscription" || input.authType === "api-key" ? input.authType : "";
      const credentialRef = typeof input.credentialRef === "string" ? input.credentialRef : "";
      const catalogEntry = REGISTRY.find((entry) => entry.id === provider);
      if (!id || !catalogEntry || !authType || !credentialRef.startsWith("ai-router:credential:")) {
        sendJson(response, 400, { error: "A valid provider, connection id, auth type, and Vault credential reference are required" });
        return;
      }
      const connection = {
        id,
        provider,
        name: typeof input.name === "string" ? input.name : catalogEntry.display?.name || provider,
        authType,
        credentialRef,
        defaultModel: typeof input.defaultModel === "string" ? input.defaultModel : undefined,
        isActive: true,
        testStatus: "Pending test",
        connectedAt: new Date().toISOString(),
      };
      const connections = readConnections().filter((item) => item.id !== id);
      connections.push(connection);
      writeConnections(connections);
      sendJson(response, 201, { connection });
    }).catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }
  const connectionPath = url.pathname.match(/^\/v1\/providers\/([^/]+)$/);
  if (connectionPath && request.method === "DELETE") {
    const id = decodeURIComponent(connectionPath[1]);
    if (!deleteConnection(id)) {
      sendJson(response, 404, { error: "AI Router connection was not found." });
      return;
    }
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  const testPath = url.pathname.match(/^\/v1\/providers\/([^/]+)\/test$/);
  if (testPath && request.method === "POST") {
    const id = decodeURIComponent(testPath[1]);
    void testConnection(id)
      .then((result) => sendJson(response, 200, result))
      .catch((error) => sendJson(response, 422, { valid: false, error: error instanceof Error ? error.message : String(error) }));
    return;
  }
  if (url.pathname === "/v1/models") {
    sendJson(response, 200, { object: "list", data: modelsForConnections(readConnections()) });
    return;
  }
  if (url.pathname === "/v1/chat/completions" || url.pathname === "/v1/responses") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: { message: "Use POST for AI Router chat requests." } });
      return;
    }
    void readJson(request)
      .then((input) => handleChat(request, response, input))
      .catch((error) => sendJson(response, 400, { error: { message: error.message } }));
    return;
  }
  sendJson(response, 404, { error: "AI Router only exposes /health and /v1/*" });
});

server.listen(port, host, () => {
  console.error(`[ai-router] native core listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
