/**
 * Loads the app's skills from `skills/<name>/SKILL.md` at build time.
 *
 * Each skill is a standard Agent Skills directory
 * (https://agentskills.io/specification): YAML frontmatter with `name` and
 * `description`, plus app-specific display fields under `metadata` using
 * `vua-`-prefixed keys. The markdown body holds the instructions an engine
 * uses when the skill runs.
 */

export interface AgentSkill {
  /** Spec `name` — also the directory name and the app-level id. */
  name: string;
  /** Spec `description` — what the skill does and when to use it. */
  description: string;
  metadata: Record<string, string>;
  /** Markdown body: the instructions loaded when the skill activates. */
  instructions: string;
}

export interface SkillTemplate {
  id: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  /** Pre-filled into the chat composer when the user clicks Use. */
  prompt: string;
  /** Full instruction body, for the engine once real providers are wired. */
  instructions: string;
}

/**
 * Minimal frontmatter parser covering the subset of YAML the spec examples
 * use: top-level `key: value` pairs and one level of nested mapping
 * (`metadata:`). Double-quoted values may contain JSON-style escapes.
 */
export function parseSkillMd(raw: string): AgentSkill {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error("SKILL.md is missing YAML frontmatter");
  const body = raw.slice(match[0].length).trim();

  const top: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  let inMetadata = false;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indented = /^\s/.test(line);
    const entry = line.trim().match(/^([\w-]+):\s*(.*)$/);
    if (!entry) continue;
    const [, key, rawValue] = entry;
    if (!indented) {
      inMetadata = key === "metadata" && rawValue === "";
      if (!inMetadata) top[key] = unquote(rawValue);
    } else if (inMetadata) {
      metadata[key] = unquote(rawValue);
    }
  }

  if (!top.name) throw new Error("SKILL.md frontmatter is missing `name`");
  if (!top.description) {
    throw new Error(`skill ${top.name}: frontmatter is missing \`description\``);
  }
  return { name: top.name, description: top.description, metadata, instructions: body };
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

const files = import.meta.glob<string>("../../skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const SKILLS: SkillTemplate[] = Object.entries(files)
  .map(([path, raw]) => {
    const skill = parseSkillMd(raw);
    const parts = path.split("/");
    const dir = parts[parts.length - 2];
    if (dir !== skill.name) {
      throw new Error(`skill directory "${dir}" must match name "${skill.name}"`);
    }
    return {
      order: Number(skill.metadata["vua-order"] ?? 999),
      template: {
        id: skill.name,
        name: skill.metadata["vua-title"] ?? skill.name,
        emoji: skill.metadata["vua-emoji"] ?? "🧩",
        category: skill.metadata["vua-category"] ?? "General",
        description: skill.metadata["vua-tagline"] ?? skill.description,
        prompt: skill.metadata["vua-prompt"] ?? "",
        instructions: skill.instructions,
      } satisfies SkillTemplate,
    };
  })
  .sort((a, b) => a.order - b.order)
  .map((s) => s.template);
