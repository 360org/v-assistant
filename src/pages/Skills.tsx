import { useMemo, useState } from "react";
import { Download, Trash2, Wand2 } from "lucide-react";
import { SKILLS, parseSkillMd, toTemplate } from "@/lib/skills";
import { useApp } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function Skills() {
  const { useSkill, customSkills, addCustomSkill, removeCustomSkill } =
    useApp();
  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const custom = useMemo(
    () =>
      customSkills.flatMap((c) => {
        try {
          return [{ template: toTemplate(parseSkillMd(c.raw)), source: c.source }];
        } catch {
          return [];
        }
      }),
    [customSkills],
  );

  const installFromUrl = async () => {
    const target = url.trim();
    if (!target) return;
    setInstalling(true);
    setError(null);
    try {
      const response = await fetch(target);
      if (!response.ok) {
        throw new Error(`could not fetch the skill (HTTP ${response.status})`);
      }
      const raw = await response.text();
      const skill = parseSkillMd(raw); // validates name + description exist
      if (!NAME_RE.test(skill.name) || skill.name.length > 64) {
        throw new Error(`"${skill.name}" is not a valid skill name`);
      }
      if (SKILLS.some((s) => s.id === skill.name)) {
        throw new Error(`"${skill.name}" is already built in`);
      }
      addCustomSkill({ raw, source: target });
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Skills</h1>
      <p className="mt-1 text-neutral-400">
        Everyday tasks, one click away. Pick a skill and just fill in the
        blanks — no prompt writing needed.
      </p>

      {/* Install any standard Agent Skill (SKILL.md) from a URL. */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void installFromUrl()}
          placeholder="Install from URL — paste a link to a SKILL.md"
          className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-gold-400/60"
        />
        <Button
          variant="secondary"
          disabled={!url.trim() || installing}
          onClick={() => void installFromUrl()}
        >
          <Download className="size-4" />
          {installing ? "Installing…" : "Install"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">⚠️ {error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {custom.map(({ template, source }) => (
          <Card key={source} className="flex flex-col">
            <div className="flex items-start justify-between">
              <span className="text-3xl">{template.emoji}</span>
              <Badge tone="gold">Custom</Badge>
            </div>
            <h3 className="mt-3 font-semibold">{template.name}</h3>
            <p className="mt-1 flex-1 text-sm text-neutral-400">
              {template.description}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => useSkill(template.prompt || template.description)}
              >
                <Wand2 className="size-3.5" /> Use
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeCustomSkill(source)}
                title="Remove"
              >
                <Trash2 className="size-3.5 text-red-400" />
              </Button>
            </div>
          </Card>
        ))}
        {SKILLS.map((skill) => (
          <Card key={skill.id} className="flex flex-col">
            <div className="flex items-start justify-between">
              <span className="text-3xl">{skill.emoji}</span>
              <Badge>{skill.category}</Badge>
            </div>
            <h3 className="mt-3 font-semibold">{skill.name}</h3>
            <p className="mt-1 flex-1 text-sm text-neutral-400">
              {skill.description}
            </p>
            <div className="mt-4">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => useSkill(skill.prompt)}
              >
                <Wand2 className="size-3.5" /> Use
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
