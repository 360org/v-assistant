// A saved pack must survive signing in again.
//
// Connections get a new id on re-authentication, and the old one is removed.
// Pack models pinned with `?account=<old id>` used to be returned untouched, so
// every saved pack silently pointed at an account that no longer existed: the
// editor showed nothing selected, the ids it loaded matched no checkbox, and
// saving was always refused with "Pack contains a model without a Verified
// connection" — with no way to fix it from the UI.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sidecar = fs.readFileSync(path.join(root, "ai-router", "src", "sidecar.mjs"), "utf8");

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

// Lift the function under test out of the sidecar rather than booting it: it is
// pure, and this keeps the check offline and instant.
const source = sidecar.slice(
  sidecar.indexOf("function packModelsForConnections"),
  sidecar.indexOf("function modelsForConnections"),
);
const packModelsForConnections = new Function(`${source}; return packModelsForConnections;`)();

const LIVE = "antigravity:5584492d-fe3d-411e-9b95-f2b781b24326";
const DEAD = "antigravity_1785118192453";
const connections = [
  { id: LIVE, provider: "antigravity", isActive: true, testStatus: "Verified" },
  { id: "claude:dead", provider: "claude", isActive: true, testStatus: "Failed" },
  { id: "codex:off", provider: "codex", isActive: false, testStatus: "Verified" },
];
const pinned = (id) => `?account=${encodeURIComponent(id)}`;

// --- the reported bug --------------------------------------------------------
let out = packModelsForConnections([`antigravity/gemini-3-flash${pinned(DEAD)}`], connections);
check("a pin to a removed account is re-bound to the live one", out[0] === `antigravity/gemini-3-flash${pinned(LIVE)}`);

// --- what must not change ----------------------------------------------------
out = packModelsForConnections([`antigravity/gemini-3-flash${pinned(LIVE)}`], connections);
check("a pin to a live account is left alone", out[0] === `antigravity/gemini-3-flash${pinned(LIVE)}`);

out = packModelsForConnections(["antigravity/gemini-3-flash"], connections);
check("an unpinned model is bound to a live account", out[0] === `antigravity/gemini-3-flash${pinned(LIVE)}`);

// --- a provider with nothing usable -----------------------------------------
out = packModelsForConnections([`claude/claude-opus${pinned("claude:dead")}`], connections);
check("an unverified connection is not a valid target", out[0] === "claude/claude-opus");

out = packModelsForConnections([`codex/gpt-5${pinned("codex:off")}`], connections);
check("a disabled connection is not a valid target", out[0] === "codex/gpt-5");

out = packModelsForConnections(["mistral/large"], connections);
check("a provider with no connection at all is left bare", out[0] === "mistral/large");

// --- the id format changed between releases; both must re-bind ---------------
out = packModelsForConnections(
  [`antigravity/a${pinned("antigravity:3e3fbe09-9fc1-45e8-901a-7f35dcaf913d")}`, `antigravity/b${pinned(DEAD)}`],
  connections,
);
check(
  "both historical connection-id formats are re-bound",
  out[0] === `antigravity/a${pinned(LIVE)}` && out[1] === `antigravity/b${pinned(LIVE)}`,
);

// --- the editor must not hold ids no checkbox represents ---------------------
const chat = fs.readFileSync(path.join(root, "src", "pages", "Chat.tsx"), "utf8");
check(
  "the pack editor drops models it cannot show",
  chat.includes("selectable.has(id)"),
);

console.log(pass ? "\n✓ packs survive re-authentication" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
