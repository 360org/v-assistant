import { useMemo, useState } from "react";
import { Check, Download, Settings2, Trash2, Wand2, X } from "lucide-react";
import { SKILLS, parseSkillMd, toTemplate } from "@/lib/skills";
import {
  NANOCLAW_SKILLS,
  ENGINE_SKILL_KIND_LABEL,
  type EngineSkill,
} from "@/lib/nanoclawSkills";
import { useApp } from "@/lib/store";
import { saveVaultEntry, deleteVaultEntry } from "@/runtime/vault";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const engineVaultId = (id: string) => `engine:${id}`;

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function Skills() {
  const {
    useSkill,
    customSkills,
    addCustomSkill,
    removeCustomSkill,
    installedEngineSkills,
    toggleEngineSkill,
  } = useApp();
  const [configFor, setConfigFor] = useState<EngineSkill | null>(null);

  const onInstallEngineSkill = (skill: EngineSkill) => {
    // Channels/providers that need credentials configure on install;
    // capabilities without fields just toggle on.
    if (skill.fields?.length) setConfigFor(skill);
    else toggleEngineSkill(skill.id);
  };

  const onRemoveEngineSkill = async (skill: EngineSkill) => {
    if (skill.fields?.length) await deleteVaultEntry(engineVaultId(skill.id));
    toggleEngineSkill(skill.id);
  };
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

      <h2 className="mt-8 text-lg font-semibold">Task skills</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                onClick={() =>
                  useSkill(template.prompt || template.description, {
                    name: template.name,
                    instructions: template.instructions,
                  })
                }
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
                onClick={() =>
                  useSkill(skill.prompt, {
                    name: skill.name,
                    instructions: skill.instructions,
                  })
                }
              >
                <Wand2 className="size-3.5" /> Use
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* NanoClaw engine skills — channels, providers, capabilities. */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold">NanoClaw skills</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Engine capabilities — channels, providers and powers. Install to
          add them to your assistant.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NANOCLAW_SKILLS.map((skill) => {
            const installed = installedEngineSkills.includes(skill.id);
            return (
              <Card key={skill.id} className="flex items-center gap-4">
                <span className="text-3xl">{skill.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{skill.name}</h3>
                    <Badge>{ENGINE_SKILL_KIND_LABEL[skill.kind]}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-400">
                    {skill.description}
                  </p>
                </div>
                {installed ? (
                  <div className="flex items-center gap-1">
                    {skill.fields?.length ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfigFor(skill)}
                        title="Edit configuration"
                      >
                        <Settings2 className="size-3.5" /> Configure
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onRemoveEngineSkill(skill)}
                      title="Remove"
                    >
                      <Check className="size-3.5 text-emerald-400" /> Installed
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onInstallEngineSkill(skill)}
                    title={skill.command}
                  >
                    <Download className="size-3.5" /> Install
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {configFor && (
        <EngineSkillConfig
          skill={configFor}
          onClose={() => setConfigFor(null)}
          onSaved={async (values) => {
            await saveVaultEntry({
              id: engineVaultId(configFor.id),
              label: `${configFor.name} (skill)`,
              service: configFor.id,
              fields: (configFor.fields ?? [])
                .map((f) => ({
                  label: f.label,
                  value: values[f.key] ?? "",
                  type: (f.secret ? "password" : "text") as "password" | "text",
                }))
                .filter((f) => f.value.trim() !== ""),
              updatedAt: Date.now(),
            });
            if (!installedEngineSkills.includes(configFor.id)) {
              toggleEngineSkill(configFor.id);
            }
            setConfigFor(null);
          }}
        />
      )}
    </div>
  );
}

function EngineSkillConfig({
  skill,
  onClose,
  onSaved,
}: {
  skill: EngineSkill;
  onClose: () => void;
  onSaved: (values: Record<string, string>) => void | Promise<void>;
}) {
  const fields = skill.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const valid = fields
    .filter((f) => !f.optional)
    .every((f) => (values[f.key] ?? "").trim() !== "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{skill.emoji}</span>
            <h2 className="font-semibold">Configure {skill.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {skill.hint && (
          <p className="mt-3 text-xs text-neutral-400">{skill.hint}</p>
        )}
        <div className="mt-4 flex flex-col gap-3">
          {fields.map((f) => (
            <label key={f.key} className="text-xs text-neutral-400">
              {f.label}
              {f.optional ? " (optional)" : ""}
              <input
                className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-gold-400/60"
                type={f.secret ? "password" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSaved(values);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save & install"}
          </Button>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">
          Saved to your Vault — the engine reads it to run {skill.name}.
        </p>
      </div>
    </div>
  );
}
