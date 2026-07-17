import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tools = readFileSync(new URL("../src/runtime/tools.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src-tauri/src/runtime.rs", import.meta.url), "utf8");

assert(tools.includes('name: "connector_request"'), "Webview tools must use the opaque connector gateway");
assert(tools.includes('invoke<string>("runtime_connector_request"'), "Webview must delegate credentialed calls to Tauri");
assert(!tools.includes("resolveVaultPlaceholders"), "Webview agent tools must not resolve Vault secrets");
assert(!tools.includes("readField(entry"), "Webview agent tools must not read credential values");
assert(runtime.includes("Authorization: Bearer {}"), "Tauri must hold the gateway capability outside the Webview");

console.log("Connector boundary OK: Webview passes opaque refs to Tauri; no agent-side Vault resolver remains");
