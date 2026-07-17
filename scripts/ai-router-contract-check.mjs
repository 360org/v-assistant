import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const core = path.join(root, "ai-router", "core");
const registry = path.join(core, "open-sse", "providers", "registry");
const runnerAdapter = path.join(root, "agent-runner", "src", "providers", "adapters", "openai.ts");
const sidecar = path.join(root, "ai-router", "src", "sidecar.mjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(fs.existsSync(path.join(core, "THIRD_PARTY_9ROUTER_LICENSE")), "AI Router core license is missing");
assert(fs.existsSync(path.join(registry, "index.js")), "AI Router provider registry is missing");

const providers = fs.readdirSync(registry).filter((file) => file.endsWith(".js") && file !== "index.js");
assert(providers.length >= 90, `Expected the full 9router registry, found only ${providers.length} providers`);

const adapter = fs.readFileSync(runnerAdapter, "utf8");
assert(adapter.includes("registerProvider('ai-router'"), "Agent Runner does not register AI Router");
assert(adapter.includes("http://127.0.0.1:20128/v1"), "AI Router local proxy contract changed unexpectedly");
assert(fs.existsSync(sidecar), "AI Router sidecar is missing");
const sidecarSource = fs.readFileSync(sidecar, "utf8");
assert(sidecarSource.includes('url.pathname === "/health"') && sidecarSource.includes('url.pathname === "/v1/chat/completions"'), "AI Router public API boundary is missing");
assert(sidecarSource.includes('url.pathname === "/v1/providers"'), "AI Router connection catalog is not exposed");
assert(sidecarSource.includes("mode: \"native-core\""), "AI Router is still delegating to an upstream service");
assert(sidecarSource.includes('url.pathname === "/v1/models"'), "AI Router model filtering is missing");

console.log(`AI Router contract OK: ${providers.length} inherited providers, Runner -> 127.0.0.1:20128/v1`);
