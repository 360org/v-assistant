// Proves connectors: an agent calls a connected system by name, and the
// connector fetches the credential from the Vault and applies the right auth
// automatically — the token never passes through the agent. Uses the real
// callConnector against a stubbed system API.

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

// Vault (web branch) uses localStorage.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// Stub GitHub's API: capture the Authorization header the connector sends.
let seenAuth = null;
let seenUrl = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("api.github.com")) {
    seenUrl = u;
    seenAuth = init.headers.Authorization;
    return new Response(JSON.stringify([{ name: "my-repo" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(url, init);
};

const entry = `
export { callConnector } from "../src/runtime/connectors.ts";
export { saveVaultEntry } from "../src/runtime/vault.ts";
`;
writeFileSync("scripts/.connector-entry.mjs", entry);
const outfile = "scripts/.connector-bundle.mjs";
await build({
  entryPoints: ["scripts/.connector-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
const { callConnector, saveVaultEntry } = await import(pathToFileURL(outfile).href);

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

// The Integrations page saves the GitHub token to the Vault like this.
await saveVaultEntry({
  id: "integration:github",
  label: "GitHub",
  service: "github",
  fields: [{ label: "Personal access token", value: "ghp_SECRET123", type: "password" }],
  updatedAt: Date.now(),
});

// The agent only names the connector + a path — no token, no auth wiring.
const res = await callConnector({ connector: "github", target: "/user/repos" });

check("connector call succeeds", res.ok && res.body.includes("my-repo"));
check("base URL applied from a path", seenUrl === "https://api.github.com/user/repos");
check(
  "credential pulled from Vault and auth applied",
  seenAuth === "Bearer ghp_SECRET123",
);

// Unknown/again-not-connected connector reports cleanly.
const missing = await callConnector({ connector: "notion", target: "/x" });
check("missing connection reported, not crashed", !missing.ok && /connect/i.test(missing.body));

rmSync("scripts/.connector-entry.mjs", { force: true });
rmSync(outfile, { force: true });
console.log(pass ? "\n✓ connectors use the Vault to operate other systems" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
