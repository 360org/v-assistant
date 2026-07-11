// Validates every skill in skills/ and .claude/skills/ against the Agent
// Skills specification (https://agentskills.io/specification):
//   - SKILL.md exists and has YAML frontmatter
//   - name: 1-64 chars, lowercase alphanumerics + single hyphens, not at
//     the edges, and matching the parent directory name
//   - description: 1-1024 chars
//   - compatibility (optional): 1-500 chars
//   - metadata (optional): string keys/values
//   - body under 500 lines (progressive-disclosure recommendation)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["skills", ".claude/skills"];
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let checked = 0;
const errors = [];
const fail = (skill, msg) => errors.push(`${skill}: ${msg}`);

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  const fields = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const entry = line.trim().match(/^([\w-]+):\s*(.*)$/);
    if (!entry) continue;
    if (/^\s/.test(line)) {
      if (currentKey) fields[currentKey][entry[1]] = entry[2];
    } else if (entry[2] === "") {
      currentKey = entry[1];
      fields[currentKey] = {};
    } else {
      currentKey = null;
      fields[entry[1]] = entry[2].replace(/^"(.*)"$/s, "$1");
    }
  }
  return { fields, body: raw.slice(match[0].length) };
}

for (const root of ROOTS) {
  if (!existsSync(root)) continue;
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const id = `${root}/${dir.name}`;
    const skillPath = join(root, dir.name, "SKILL.md");
    checked++;
    if (!existsSync(skillPath)) {
      fail(id, "missing SKILL.md");
      continue;
    }
    const parsed = parseFrontmatter(readFileSync(skillPath, "utf8"));
    if (!parsed) {
      fail(id, "missing YAML frontmatter");
      continue;
    }
    const { fields, body } = parsed;

    const name = fields.name;
    if (typeof name !== "string" || name.length === 0) {
      fail(id, "missing or empty required field `name`");
    } else {
      if (name.length > 64) fail(id, "`name` exceeds 64 characters");
      if (!NAME_RE.test(name)) {
        fail(
          id,
          "`name` must be lowercase alphanumerics and single hyphens, not at the edges",
        );
      }
      if (name !== dir.name) {
        fail(id, `\`name\` ("${name}") must match directory ("${dir.name}")`);
      }
    }

    const description = fields.description;
    if (typeof description !== "string" || description.length === 0) {
      fail(id, "missing or empty required field `description`");
    } else if (description.length > 1024) {
      fail(id, "`description` exceeds 1024 characters");
    }

    if ("compatibility" in fields) {
      const c = fields.compatibility;
      if (typeof c !== "string" || c.length < 1 || c.length > 500) {
        fail(id, "`compatibility` must be a 1-500 character string");
      }
    }

    if ("metadata" in fields && typeof fields.metadata !== "object") {
      fail(id, "`metadata` must be a key-value mapping");
    }

    const lines = body.split("\n").length;
    if (lines > 500) {
      fail(id, `body is ${lines} lines; keep SKILL.md under 500 lines`);
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) in ${checked} skill(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ ${checked} skill(s) comply with the Agent Skills spec`);
