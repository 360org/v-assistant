// Checks scheduled tasks: the schedule matcher (isDue) and the runner
// (runDueTasks) that fires a due task through the real assistant code path
// and delivers the result. In-app, no Docker.

import { createServer } from "node:http";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const MODEL_PORT = 8153;

// --- Mock model (OpenAI-compatible SSE) -------------------------------------
const model = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { messages } = JSON.parse(body || "{}");
    const user = [...messages].reverse().find((m) => m.role === "user");
    const reply = `Summary for: ${user?.content ?? ""}`;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const w of reply.split(/(?<=\s)/)) {
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`,
      );
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });
});
await new Promise((r) => model.listen(MODEL_PORT, r));

// --- Bundle the real modules ------------------------------------------------
const entry = `
export { isDue } from "../src/runtime/schedule.ts";
export { runDueTasks } from "../src/runtime/scheduler.ts";
`;
writeFileSync("scripts/.schedule-entry.mjs", entry);
const outfile = "scripts/.schedule-bundle.mjs";
await build({
  entryPoints: ["scripts/.schedule-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  // knowledge.ts lazy-loads pdfjs for PDFs; not needed in these checks.
  external: ["pdfjs-dist", "pdfjs-dist/build/pdf.worker.min.mjs?url"],
  logLevel: "silent",
});
const { isDue, runDueTasks } = await import(pathToFileURL(outfile).href);

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

// --- isDue unit cases -------------------------------------------------------
const at9 = new Date("2026-07-13T09:00:00"); // Monday 09:00 local
const at8 = new Date("2026-07-13T08:00:00");
const sat = new Date("2026-07-11T09:00:00"); // Saturday
const firstOfMonth = new Date("2026-08-01T09:00:00");

check("daily fires at 09:00 when never run", isDue("Every day at 9:00", at9, undefined));
check("daily not due before 09:00", !isDue("Every day at 9:00", at8, undefined));
check(
  "daily not re-fired after running past 09:00",
  !isDue("Every day at 9:00", at9, at9.getTime()),
);
check("weekday fires Monday 08:00", isDue("Every weekday at 8:00", at8, undefined));
check("weekday skips Saturday", !isDue("Every weekday at 9:00", sat, undefined));
check("named day fires on Monday", isDue("Every Monday at 9:00", at9, undefined));
check("named day skips Saturday", !isDue("Every Monday at 9:00", sat, undefined));
check(
  "hourly fires after an hour",
  isDue("Every hour", at9, at9.getTime() - 3_600_000),
);
check(
  "hourly not due after 10 min",
  !isDue("Every hour", at9, at9.getTime() - 600_000),
);
check("monthly fires on the 1st", isDue("On the 1st of each month", firstOfMonth, undefined));
check("monthly skips other days", !isDue("On the 1st of each month", at9, undefined));

// --- runner integration: a due task runs and delivers -----------------------
const delivered = [];
const marks = [];
const tasks = [
  {
    id: "t1",
    name: "Morning summary",
    prompt: "summarize my day",
    schedule: "Every day at 9:00",
    enabled: true,
    lastRun: undefined,
  },
  {
    id: "t2",
    name: "Paused one",
    prompt: "nope",
    schedule: "Every day at 9:00",
    enabled: false,
  },
];
const fired = await runDueTasks(tasks, at9, {
  resolveOptions: () => ({
    provider: "openrouter",
    config: { apiKey: "x", baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`, model: "mock" },
  }),
  markRun: (id, at) => marks.push([id, at]),
  deliver: (task, result) => delivered.push([task.id, result]),
});

check("only the enabled due task fired", fired.length === 1 && fired[0] === "t1");
check("run was recorded before delivery", marks[0]?.[0] === "t1");
check(
  "assistant result delivered",
  delivered.length === 1 &&
    delivered[0][0] === "t1" &&
    delivered[0][1].includes("summarize my day"),
);

model.close();
rmSync("scripts/.schedule-entry.mjs", { force: true });
rmSync(outfile, { force: true });

console.log(pass ? "\n✓ scheduled tasks run on schedule" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
