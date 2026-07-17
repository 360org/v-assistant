import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

const close = (server) => new Promise((resolve) => server.close(resolve));
const readBody = (request) => new Promise((resolve) => {
  let value = "";
  request.on("data", (chunk) => { value += chunk; });
  request.on("end", () => resolve(value));
});

const vaultToken = "vault-broker-test-capability";
const connectorToken = "connector-test-capability";
const secret = "agent-must-never-see-this-secret";
const username = "opaque-user";
const vault = new Map();

const upstream = createServer(async (request, response) => {
  const body = await readBody(request);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    authorization: request.headers.authorization,
    body,
    username,
    secret,
  }));
});

const upstreamPort = await listen(upstream);
vault.set("vault-entry:test", JSON.stringify({
  label: "Test service",
  service: "test",
  url: `http://127.0.0.1:${upstreamPort}/api`,
  username,
  password: secret,
}));
vault.set("vault-index", JSON.stringify([{ id: "test", label: "Test service", service: "test" }]));
vault.set("ai-router:connections", JSON.stringify({ connections: [] }));

const broker = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${vaultToken}`) {
    response.writeHead(401).end();
    return;
  }
  const url = new URL(request.url, "http://127.0.0.1");
  const ref = url.searchParams.get("ref");
  if (request.method === "GET") {
    if (!vault.has(ref)) {
      response.writeHead(404).end();
      return;
    }
    const payload = JSON.stringify({ value: vault.get(ref) });
    response.writeHead(200, { "content-type": "application/json" }).end(payload);
    return;
  }
  response.writeHead(405).end();
});

const brokerPort = await listen(broker);
const routerProbe = createServer();
const routerPort = await listen(routerProbe);
await close(routerProbe);

const sidecarPath = fileURLToPath(new URL("../ai-router/src/sidecar.mjs", import.meta.url));
const child = spawn(process.execPath, [sidecarPath], {
  cwd: fileURLToPath(new URL("../ai-router", import.meta.url)),
  env: {
    ...process.env,
    AI_ROUTER_PORT: String(routerPort),
    AI_ROUTER_VAULT_BROKER_URL: `http://127.0.0.1:${brokerPort}/credential`,
    AI_ROUTER_VAULT_BROKER_TOKEN: vaultToken,
    AI_ROUTER_CONNECTOR_TOKEN: connectorToken,
  },
  stdio: ["ignore", "ignore", "pipe"],
});

let sidecarError = "";
child.stderr.on("data", (chunk) => { sidecarError += chunk; });

const routerUrl = `http://127.0.0.1:${routerPort}`;
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${routerUrl}/health`);
      if (response.ok) break;
    } catch { /* startup */ }
    if (attempt === 79) throw new Error(`AI Router did not start: ${sidecarError}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const request = (token, overrides = {}) => fetch(`${routerUrl}/v1/connectors/request`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      credentialRef: "vault-entry:test",
      url: `http://127.0.0.1:${upstreamPort}/api/resource`,
      method: "POST",
      headers: { authorization: "Bearer {{credential:password}}" },
      body: "user={{credential:username}}&password={{credential:password}}",
      ...overrides,
    }),
  });

  const denied = await request("wrong-capability");
  assert.equal(denied.status, 401, "Connector gateway must require its process capability");

  const manifestResponse = await fetch(`${routerUrl}/v1/vault/manifest`, {
    headers: { authorization: `Bearer ${connectorToken}` },
  });
  assert.equal(manifestResponse.status, 200);
  const manifest = JSON.stringify(await manifestResponse.json());
  assert(manifest.includes("vault-entry:test"), "Agent manifest must expose an opaque Vault ref");
  assert(manifest.includes("password"), "Agent manifest must expose available variable names");
  assert(!manifest.includes(secret), "Agent manifest leaked a secret value");
  assert(!manifest.includes(username), "Agent manifest leaked a username value");

  const wrongOrigin = await request(connectorToken, { url: "https://example.com/escape" });
  assert.equal(wrongOrigin.status, 422, "A Vault reference must not authorize another origin");

  const literalSecret = await request(connectorToken, {
    headers: { authorization: "Bearer literal-value" },
  });
  assert.equal(literalSecret.status, 422, "Credential headers must use opaque variables");

  const allowed = await request(connectorToken);
  assert.equal(allowed.status, 200);
  assert(allowed.headers.has("content-length"), "Tauri bridge requires a non-chunked JSON response");
  const payload = await allowed.json();
  const returned = JSON.stringify(payload);
  assert(!returned.includes(secret), "Resolved secret leaked into the agent-visible response");
  assert(!returned.includes(username), "Resolved username leaked into the agent-visible response");
  assert(returned.includes("[REDACTED:password]"), "Gateway did not redact the resolved password");
  assert(returned.includes("[REDACTED:username]"), "Gateway did not redact the resolved username");

  process.env.VUA_AI_ROUTER_URL = routerUrl;
  process.env.VUA_CONNECTOR_GATEWAY_TOKEN = connectorToken;
  const bundledTools = await build({
    entryPoints: [fileURLToPath(new URL("../agent-runner/src/native-tools/index.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const toolsModule = await import(`data:text/javascript;base64,${Buffer.from(bundledTools.outputFiles[0].text).toString("base64")}`);
  const listed = await toolsModule.executeTool("vault_list", {});
  assert(listed.content.includes("vault-entry:test"), "Agent vault_list did not query the opaque Vault manifest");
  assert(!listed.content.includes(secret), "Agent vault_list received a secret value");
  const executed = await toolsModule.executeTool("connector_request", {
    credential_ref: "vault-entry:test",
    url: `http://127.0.0.1:${upstreamPort}/api/native-tool`,
    method: "POST",
    headers: { authorization: "Bearer {{credential:password}}" },
    body: "user={{credential:username}}",
  });
  assert(!executed.content.includes(secret), "Agent connector_request received a raw secret");
  assert(executed.content.includes("[REDACTED:password]"), "Agent connector_request missed gateway redaction");

  console.log("Connector capability OK: real Agent tools query opaque refs; gateway resolves and redacts secrets");
} finally {
  child.kill("SIGTERM");
  await Promise.all([close(upstream), close(broker)]);
}
