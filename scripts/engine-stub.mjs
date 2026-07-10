// Development stand-in for a NanoClaw engine install.
//
// Implements the engine side of the runtime's channel contract: poll the
// inbound SQLite queue, "run the agent", write the reply to the outbound
// queue. A real NanoClaw install does the same thing with per-group Docker
// containers running the Claude Agent SDK; this stub echoes, so the
// desktop ↔ engine seam can be exercised without Docker or credentials.
//
// Usage: VUA_RUNTIME_DIR=<runtime dir> node scripts/engine-stub.mjs
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

const dir = process.env.VUA_RUNTIME_DIR;
if (!dir) {
  console.error("engine-stub: VUA_RUNTIME_DIR is not set");
  process.exit(1);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   TEXT NOT NULL,
    sender     TEXT NOT NULL,
    content    TEXT NOT NULL,
    meta       TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );`;

function open(name) {
  const db = new DatabaseSync(join(dir, "ipc", name));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

const inbound = open("inbound.db");
const outbound = open("outbound.db");

// Drain the backlog too: a real engine answers whatever queued while it
// was down, and the desktop may send before the engine finishes booting.
let lastSeen = 0;

const nextInbound = inbound.prepare(
  "SELECT id, group_id, content, meta FROM messages WHERE id > ? ORDER BY id",
);
const reply = outbound.prepare(
  "INSERT INTO messages (group_id, sender, content, meta, created_at) VALUES (?, 'assistant', ?, '{}', unixepoch())",
);

console.log(`engine-stub: attached to ${dir}, watching from id ${lastSeen}`);
setInterval(() => {
  for (const msg of nextInbound.all(lastSeen)) {
    lastSeen = msg.id;
    const meta = JSON.parse(msg.meta || "{}");
    const agent = meta.agent ? ` (agent: ${meta.agent})` : "";
    reply.run(
      msg.group_id,
      `Engine reply${agent}: received “${msg.content}” on group “${msg.group_id}”.`,
    );
  }
}, 150);
