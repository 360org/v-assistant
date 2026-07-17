// Kiểm chứng bộ import Agent từ persona markdown ("The Agency" format):
// frontmatter + các mục ## → Agent (name/description/emoji/soul/instructions).

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

const entry = `export { parseAgencyAgent } from "../src/runtime/agentImport.ts";`;
writeFileSync("scripts/.agentimport-entry.mjs", entry);
const outfile = "scripts/.agentimport-bundle.mjs";
await build({
  entryPoints: ["scripts/.agentimport-entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
const { parseAgencyAgent } = await import(pathToFileURL(outfile).href);

const sample = `---
name: Frontend Developer
description: Expert frontend developer specializing in React/Vue/Angular and performance
color: cyan
emoji: 🖥️
vibe: Builds responsive, accessible web apps with pixel-perfect precision.
---

## 🧠 Your Identity & Memory
You are a meticulous frontend craftsperson.

## 🎯 Your Core Mission
Ship accessible, fast, pixel-perfect interfaces.

## 🚨 Critical Rules You Must Follow
- Never ship inaccessible markup.
- Always measure performance.

## 🔄 Your Workflow Process
1. Understand the design. 2. Build. 3. Test. 4. Optimize.

## 💭 Your Communication Style
Concise, friendly, and precise.

## 🎯 Your Success Metrics
Lighthouse > 95, zero a11y violations.
`;

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) pass = false;
};

const a = parseAgencyAgent(sample, "https://example/frontend.md");
check("parsed name", a && a.name === "Frontend Developer");
check("slug id", a.id === "frontend-developer");
check("description mapped", a.description.includes("Expert frontend developer"));
check("emoji mapped", a.emoji === "🖥️");
check("soul = vibe + communication + identity", a.soul.includes("pixel-perfect precision") && a.soul.includes("Concise, friendly") && a.soul.includes("meticulous frontend"));
check("soul excludes mission/rules", !a.soul.includes("Ship accessible") && !a.soul.includes("Never ship inaccessible"));
check("instructions = mission + rules + workflow + metrics", a.instructions.includes("Ship accessible") && a.instructions.includes("Never ship inaccessible") && a.instructions.includes("Understand the design") && a.instructions.includes("Lighthouse"));
check("instructions exclude communication style", !a.instructions.includes("Concise, friendly"));
check("source recorded", a.source === "https://example/frontend.md");

// Không có frontmatter → null
check("no-frontmatter returns null", parseAgencyAgent("# just markdown\nhello") === null);
// Có frontmatter nhưng thiếu name → null
check("missing name returns null", parseAgencyAgent("---\ndescription: x\n---\nbody") === null);

rmSync("scripts/.agentimport-entry.mjs", { force: true });
rmSync(outfile, { force: true });
console.log(pass ? "\n✓ Agent import (persona markdown) hoạt động" : "\n✗ FAILED");
process.exit(pass ? 0 : 1);
