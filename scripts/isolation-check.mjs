// Proves role isolation: each agent's system prompt carries ONLY its own
// memory and knowledge — switching roles never mixes them. Verifies the real
// buildSystemPrompt from src/runtime/engine.ts.

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const entry = `export { buildSystemPrompt } from "../src/runtime/engine.ts";`;
writeFileSync("scripts/.isolation-entry.mjs", entry);
const outfile = "scripts/.isolation-bundle.mjs";
await build({
  entryPoints: ["scripts/.isolation-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  // knowledge.ts lazy-loads pdfjs for PDFs; not needed in these checks.
  external: ["pdfjs-dist", "pdfjs-dist/build/pdf.worker.min.mjs?url"],
  logLevel: "silent",
});
const { buildSystemPrompt } = await import(pathToFileURL(outfile).href);

const sales = buildSystemPrompt({
  provider: "openrouter",
  agentName: "Sales Expert",
  agentDescription: "Closes deals.",
  agentMemory: ["Average deal size is $5k"],
  agentKnowledge: ["sales-playbook.pdf"],
});
const marketing = buildSystemPrompt({
  provider: "openrouter",
  agentName: "Marketing Expert",
  agentDescription: "Runs campaigns.",
  agentMemory: ["Brand voice is playful"],
  agentKnowledge: ["marketing-plan.pdf"],
});
const base = buildSystemPrompt({
  provider: "openrouter",
  agentKnowledge: ["general-notes.pdf"],
});

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

check("Sales role sees its own knowledge", sales.includes("sales-playbook.pdf"));
check("Sales role sees its own memory", sales.includes("Average deal size"));
check(
  "Sales role does NOT see Marketing knowledge",
  !sales.includes("marketing-plan.pdf"),
);
check(
  "Sales role does NOT see Marketing memory",
  !sales.includes("Brand voice"),
);

check(
  "Marketing role sees its own knowledge",
  marketing.includes("marketing-plan.pdf"),
);
check(
  "Marketing role does NOT see Sales knowledge",
  !marketing.includes("sales-playbook.pdf"),
);
check(
  "Marketing role does NOT see Sales memory",
  !marketing.includes("Average deal size"),
);

check("Roles carry their own identity", sales.includes("Sales Expert") && !sales.includes("Marketing Expert"));
check("Base assistant has its own knowledge bucket", base.includes("general-notes.pdf"));

rmSync("scripts/.isolation-entry.mjs", { force: true });
rmSync(outfile, { force: true });
console.log(pass ? "\n✓ roles are isolated — no knowledge/memory bleed" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
