// Guards the Host Process boundary (idea.md §1.3): the brain runs in the Agent
// Runner, the webview only displays. These are the rules that are invisible at
// compile time and were each broken at least once in practice.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- the webview must not run a second brain --------------------------------
// Two copies of a loop is worse than none: the scheduler fired every task twice.
for (const gone of ["telegram.ts", "scheduler.ts", "schedule.ts", "selfImprove.ts"]) {
  assert(
    !exists("src", "runtime", gone),
    `src/runtime/${gone} is back — that subsystem belongs to the Agent Runner alone`,
  );
}

const store = read("src", "lib", "store.tsx");

// The runner holds the scheduler and the Telegram long-poll, so every restart
// tears both down. Keying the effect on an object identity respawned it 177
// times in one session.
assert(
  !/}, \[[^\]]*state\.providerConfigs[^\]]*\]\);/.test(store)
    || !/restartAgentRunner\(/.test(store),
  "The runner restart must not depend on providerConfigs — use a primitive signature",
);
assert(
  store.includes("runnerSignature"),
  "The runner restart must be keyed on a stable signature",
);

// A cold start must not overwrite the agent's own scheduled tasks with [].
assert(
  store.includes("tasksLoadedRef"),
  "scheduled_tasks.json must only be written after it has been read once",
);
assert(
  store.includes("runtimeDir()"),
  "Files shared with the runner must go to the runtime dir, not ~/.v-assistant/data",
);

// --- one outbound queue, three channels -------------------------------------
// Untagged rows let a Telegram reply surface as the chat window's answer.
assert(
  read("agent-runner", "src", "scheduler", "index.ts").includes("const CHANNEL = 'scheduled'"),
  "Scheduled results must be tagged as their own channel",
);
assert(
  read("agent-runner", "src", "channels", "telegram.ts").includes("channelType: 'telegram'"),
  "Telegram turns must be tagged as their own channel",
);
assert(
  read("src", "runtime", "nanoclaw.ts").includes('reply.channel_type !== "chat"'),
  "The chat window must ignore outbound rows from other channels",
);

// --- knowledge is readable by the runner ------------------------------------
const knowledge = read("src", "runtime", "knowledge.ts");
assert(
  !knowledge.includes("indexedDB"),
  "Knowledge chunks must live in knowledge.db — the runner cannot read IndexedDB",
);
assert(
  knowledge.includes("knowledge_put") && knowledge.includes("knowledge_list"),
  "The app must write knowledge through the runtime store",
);
assert(
  read("agent-runner", "src", "poll-loop.ts").includes("retrieveKnowledge(config.agentId"),
  "The runner must ground its answers in the role's documents",
);

// --- exactly one runner ------------------------------------------------------
const runtimeRs = read("src-tauri", "src", "runtime.rs");
assert(
  runtimeRs.includes("kill_stale_runner(dir)") && runtimeRs.includes('dir.join("runner.pid")'),
  "An orphaned runner must be stopped before a new one is spawned",
);
assert(
  runtimeRs.includes('.contains("agent-runner")'),
  "A recorded pid must be verified before it is killed — pids get reused",
);

// --- the agent can reach its own memory --------------------------------------
assert(
  read("agent-runner", "src", "native-tools", "index.ts").includes("ALLOWED_ROOTS"),
  "The sandbox must grant the agent its own directory as well as the workspace",
);

console.log(
  "host process contract passed: single brain, tagged channels, shared knowledge, one runner",
);
