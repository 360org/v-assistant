import { useMemo, useState } from "react";
import { Download, Trash2, Wand2 } from "lucide-react";
import { SKILLS, parseSkillMd, toTemplate } from "@/lib/skills";
import { useApp } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function Skills() {
  const {
    useSkill,
    customSkills,
    addCustomSkill,
    removeCustomSkill,
    activeAgentId,
    agentConfigs,
    agents,
    setView,
  } = useApp();
  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAgent = useMemo(() => {
    return agents.find((a) => a.id === activeAgentId) ?? null;
  }, [agents, activeAgentId]);

  const isSkillEnabled = (skillId: string) => {
    if (!activeAgentId) return true;
    const config = agentConfigs[activeAgentId];
    if (!config || !config.skills) return true;
    return config.skills.includes(skillId);
  };

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

  const filteredCustom = useMemo(() => {
    return custom.filter(({ template }) => isSkillEnabled(template.id));
  }, [custom, activeAgentId, agentConfigs]);

  const filteredSkills = useMemo(() => {
    return SKILLS.filter((skill) => isSkillEnabled(skill.id));
  }, [activeAgentId, agentConfigs]);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Skills</h1>
          <p className="mt-1 text-neutral-400">
            Everyday tasks, one click away. Pick a skill and just fill in the
            blanks — no prompt writing needed.
          </p>
        </div>
        <Button
          onClick={() => {
            useSkill("Hãy giúp tôi thiết kế và đóng gói một Skill mới cho AI Agent để: ", {
              name: "Skill Creator (Tự tạo Skill mới)",
              instructions: "Hãy phân tích yêu cầu của người dùng, soạn thảo quy chuẩn SKILL.md và tự động gọi công cụ `create_skill` để đóng gói và lưu Skill mới vào ứng dụng.",
            });
            setView("chat");
          }}
          className="shrink-0 font-bold bg-gradient-to-r from-gold-500 to-gold-600 text-neutral-950 hover:from-gold-400 hover:to-gold-500"
        >
          <Wand2 className="size-4 mr-1.5" /> ✨ Tạo Skill mới bằng AI
        </Button>
      </div>

      {activeAgent && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-gold-400/10 border border-gold-400/20 px-4 py-2.5 text-xs text-gold-300">
          <div className="flex items-center gap-2">
            <span className="text-sm">{activeAgent.emoji}</span>
            <span>
              Đang hiển thị kỹ năng cho vai trò <strong>{activeAgent.name}</strong>. Chỉ những kỹ năng được bật trong cấu hình vai trò mới xuất hiện tại đây.
            </span>
          </div>
          <button
            onClick={() => setView("agents")}
            className="font-medium underline hover:text-gold-200"
          >
            Cấu hình vai trò
          </button>
        </div>
      )}

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
      {(filteredCustom.length > 0 || filteredSkills.length > 0) ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredCustom.map(({ template, source }) => (
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
          {filteredSkills.map((skill) => (
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
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
          Không có kỹ năng nào được bật cho vai trò này. Bạn có thể bật chúng trong cấu hình vai trò.
        </div>
      )}

    </div>
  );
}
