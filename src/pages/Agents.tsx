import { useState, useMemo } from "react";
import { SKILLS, parseSkillMd, toTemplate } from "@/lib/skills";
import { cn } from "@/lib/utils";
import {
  Check,
  Download,
  FileCode,
  FilePlus,
  FileText,
  Link as LinkIcon,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { type AgentTemplate } from "@/lib/catalog";
import { useApp, type AgentConfig } from "@/lib/store";
import { importAgentFromUrl } from "@/runtime/agentImport";
import { syncAgents } from "@/runtime/nanoclaw";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const inputClass =
  "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 " +
  "text-sm outline-none placeholder:text-neutral-600 focus:border-gold-400/60";

export function Agents() {
  const {
    installedAgents,
    toggleAgent,
    setActiveAgent,
    setView,
    agentConfigs,
    setAgentConfig,
    agents,
    customAgents,
    removeCustomAgent,
  } = useApp();
  const [installing, setInstalling] = useState<string | null>(null);
  const [configFor, setConfigFor] = useState<AgentTemplate | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const isCustom = (id: string) => customAgents.some((a) => a.id === id);

  const install = (id: string) => {
    // One click. No GitHub, no config — the store handles everything.
    setInstalling(id);
    setTimeout(() => {
      toggleAgent(id);
      setInstalling(null);
      // Give the engine the new agent's group (best-effort, invisible).
      void syncAgents(
        agents
          .filter((a) => a.id === id || installedAgents.includes(a.id))
          .map(({ id, name, description }) => ({ id, name, description })),
      );
    }, 600);
  };

  const startChat = (id: string) => {
    setActiveAgent(id);
    setView("chat");
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agent Store</h1>
          <p className="mt-1 text-neutral-400">
            Chuyên gia dựng sẵn cho công việc của bạn. Cài, rồi cho mỗi vai trò
            hướng dẫn và tính cách riêng — hoặc nhập thêm từ URL.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <LinkIcon className="size-4" /> Nhập từ URL
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {agents.map((agent) => {
          const installed = installedAgents.includes(agent.id);
          const configured =
            agentConfigs[agent.id]?.instructions ||
            agentConfigs[agent.id]?.soul;
          return (
            <Card key={agent.id} className="flex flex-col">
              <div className="flex items-start justify-between">
                <span className="text-3xl">{agent.emoji}</span>
                <Badge>{agent.category}</Badge>
              </div>
              <h3 className="mt-3 font-semibold">{agent.name}</h3>
              <p className="mt-1 flex-1 text-sm text-neutral-400">
                {agent.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {installed ? (
                  <>
                    <Button size="sm" onClick={() => startChat(agent.id)}>
                      <MessageSquare className="size-3.5" /> Chat
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfigFor(agent)}
                    >
                      <Settings2 className="size-3.5" /> Configure
                      {configured ? (
                        <span className="ml-1 size-1.5 rounded-full bg-gold-300" />
                      ) : null}
                    </Button>
                    {isCustom(agent.id) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeCustomAgent(agent.id)}
                      >
                        <Trash2 className="size-3.5 text-red-400" /> Xóa
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleAgent(agent.id)}
                      >
                        <Check className="size-3.5 text-emerald-400" /> Installed
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={installing === agent.id}
                    onClick={() => install(agent.id)}
                  >
                    <Download className="size-3.5" />
                    {installing === agent.id ? "Installing…" : "Install"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {configFor && (
        <AgentConfigDialog
          agent={configFor}
          initial={agentConfigs[configFor.id] ?? {}}
          onClose={() => setConfigFor(null)}
          onSave={(cfg) => {
            setAgentConfig(configFor.id, cfg);
            setConfigFor(null);
          }}
        />
      )}

      {importOpen && <ImportAgentDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}

/** Nhập một Agent từ URL persona markdown (ví dụ "The Agency" trên GitHub). */
function ImportAgentDialog({ onClose }: { onClose: () => void }) {
  const { importAgent, setView } = useApp();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doImport = async () => {
    setBusy(true);
    setError(null);
    try {
      // Chấp nhận cả URL github "blob" — đổi sang raw để tải được nội dung.
      const raw = url
        .trim()
        .replace("github.com/", "raw.githubusercontent.com/")
        .replace("/blob/", "/");
      const agent = await importAgentFromUrl(raw);
      importAgent(agent);
      setView("chat");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Nhập Agent từ URL</h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800"
            aria-label="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Dán link file persona markdown (frontmatter + các mục). Ví dụ một agent
          trong bộ{" "}
          <span className="text-gold-300">msitarzewski/agency-agents</span>.
        </p>
        <input
          className={`${inputClass} mt-3`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/…/engineering-frontend-developer.md"
          autoFocus
        />
        {error && <p className="mt-2 text-xs text-red-400">⚠️ {error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button
            size="sm"
            disabled={busy || url.trim() === ""}
            onClick={() => void doImport()}
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Đang nhập…
              </>
            ) : (
              <>
                <Download className="size-3.5" /> Nhập & dùng
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AgentConfigDialog({
  agent,
  initial,
  onClose,
  onSave,
}: {
  agent: AgentTemplate;
  initial: AgentConfig;
  onClose: () => void;
  onSave: (cfg: AgentConfig) => void;
}) {
  const [instructions, setInstructions] = useState(initial.instructions ?? "");
  const [soul, setSoul] = useState(initial.soul ?? "");
  const [memory, setMemory] = useState<string[]>(initial.memory ?? []);
  const [newMemory, setNewMemory] = useState("");
  const [isMaximized, setIsMaximized] = useState(false);

  const { customSkills } = useApp();

  const allSkills = useMemo(() => {
    const builtIn = SKILLS.map((s) => ({
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      description: s.description,
    }));
    const custom = customSkills.flatMap((c) => {
      try {
        const t = toTemplate(parseSkillMd(c.raw));
        return [{
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          description: t.description,
        }];
      } catch {
        return [];
      }
    });
    return [...builtIn, ...custom];
  }, [customSkills]);

  const [enabledSkills, setEnabledSkills] = useState<string[]>(() => {
    if (initial.skills) return initial.skills;
    const builtInIds = SKILLS.map((s) => s.id);
    const customIds = customSkills.flatMap((c) => {
      try {
        return [parseSkillMd(c.raw).name];
      } catch {
        return [];
      }
    });
    return [...builtInIds, ...customIds];
  });

  const [docs, setDocs] = useState<Record<string, string>>(() => {
    const initialDocs = initial.docs ? { ...initial.docs } : {};
    if (initial.soul && !initialDocs["SOUL.md"]) {
      initialDocs["SOUL.md"] = initial.soul;
    }
    return initialDocs;
  });
  const [activeMdFile, setActiveMdFile] = useState<string>("SOUL.md");
  const [customMdInput, setCustomMdInput] = useState<string>("");

  const addMdFile = (fileName: string) => {
    const name = fileName.trim();
    if (!name) return;
    const formattedName = name.endsWith(".md") || name.endsWith(".MD") ? name : `${name}.md`;
    setDocs((prev) => ({ ...prev, [formattedName]: prev[formattedName] || "" }));
    setActiveMdFile(formattedName);
    setCustomMdInput("");
  };

  const removeMdFile = (fileName: string) => {
    const nextDocs = { ...docs };
    delete nextDocs[fileName];
    setDocs(nextDocs);
    const keys = Object.keys(nextDocs);
    if (keys.length > 0) {
      setActiveMdFile(keys[0]);
    } else {
      setActiveMdFile("SOUL.md");
    }
  };

  const handleExport = () => {
    let md = `# Agent Configuration: ${agent.name}\n\n`;
    if (instructions) md += `## Instructions\n${instructions}\n\n`;
    if (soul) md += `## Soul\n${soul}\n\n`;
    if (memory.length) md += `## Memory\n${memory.map((m) => `- ${m}`).join("\n")}\n\n`;
    if (enabledSkills.length) md += `## Skills\n${enabledSkills.map((s) => `- ${s}`).join("\n")}\n\n`;
    Object.entries(docs).forEach(([filename, content]) => {
      if (content.trim()) {
        md += `## File: ${filename}\n\`\`\`markdown\n${content}\n\`\`\`\n\n`;
      }
    });

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name.toLowerCase().replace(/\s+/g, "-")}-config.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const PRESET_MD_FILES = [
    "SOUL.md",
    "MISSION.md",
    "NORTH_STAR.md",
    "HEARTBEAT.md",
    "PRINCIPLES.md",
    "VALUES.md",
    "THINKING.md",
    "DECISION.md",
    "GOVERNANCE.md",
    "PLAYBOOK.md",
    "MANIFESTO.md",
  ];

  const addMemory = () => {
    const v = newMemory.trim();
    if (!v) return;
    setMemory((m) => [...m, v]);
    setNewMemory("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={
          isMaximized
            ? "fixed inset-4 z-50 flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl overflow-hidden"
            : "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{agent.emoji}</span>
            <h2 className="font-semibold text-lg text-neutral-250">Configure {agent.name}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              title={isMaximized ? "Thu nhỏ" : "Phóng to"}
              type="button"
            >
              {isMaximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              aria-label="Close"
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className={isMaximized ? "mt-5 grid grid-cols-2 gap-6 flex-1 overflow-hidden min-h-0" : "mt-4 flex flex-col gap-4"}>
          {/* Cột 1: Instructions & Markdown Specs */}
          <div className={isMaximized ? "flex flex-col gap-4 h-full overflow-y-auto pr-1" : "flex flex-col gap-4"}>
            <label className="text-xs text-neutral-400 flex flex-col shrink-0">
              Instructions — how it works
              <textarea
                className={`${inputClass} mt-1 resize-none h-32`}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={
                  "Describe the process/steps this agent should follow, e.g.\n" +
                  "1. Ask for the goal\n2. Draft an outline\n3. Write, then review."
                }
              />
            </label>

            {/* Markdown Spec Documents Section */}
            <div className="text-xs text-neutral-400 flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  <FileCode className="size-3.5 text-gold-400" />
                  Markdown Spec Documents (.md)
                </span>
                <span className="text-[10px] text-neutral-500">Paperclip / 360 Spec</span>
              </div>

              {/* Active Markdown Tabs */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {Object.keys(docs).length > 0 ? (
                  Object.keys(docs).map((fileName) => (
                    <div
                      key={fileName}
                      onClick={() => setActiveMdFile(fileName)}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono transition-all border",
                        activeMdFile === fileName
                          ? "border-gold-500/50 bg-gold-500/15 text-gold-300 font-bold shadow-xs"
                          : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                      )}
                    >
                      <FileText className="size-3 text-gold-400" />
                      <span>{fileName}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMdFile(fileName);
                        }}
                        className="ml-0.5 rounded p-0.5 text-neutral-500 hover:text-red-400"
                        title="Remove file"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))
                ) : (
                  <span className="text-[11px] text-neutral-500 italic">Chưa đính kèm file .md</span>
                )}
              </div>

              {/* Quick Add Presets & Custom File Input */}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-neutral-500 font-medium mr-1">Tạo nhanh:</span>
                {PRESET_MD_FILES.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => addMdFile(preset)}
                    className={cn(
                      "cursor-pointer rounded-md border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-[10px] font-mono transition-all hover:bg-neutral-800",
                      docs[preset] ? "text-emerald-400 border-emerald-500/30" : "text-neutral-400 hover:text-white"
                    )}
                    title={`Thêm ${preset}`}
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  className={`${inputClass} text-xs py-1 flex-1 font-mono`}
                  value={customMdInput}
                  onChange={(e) => setCustomMdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMdFile(customMdInput);
                    }
                  }}
                  placeholder="Nhập tên file tùy chỉnh (e.g. RULES.md)..."
                />
                <Button size="sm" variant="secondary" onClick={() => addMdFile(customMdInput)} disabled={!customMdInput.trim()} className="h-8 text-xs">
                  <FilePlus className="size-3.5" /> Add MD
                </Button>
              </div>

              {/* Markdown Content Editor */}
              {activeMdFile && (
                <div className="mt-2.5 flex flex-col flex-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-gold-400 mb-1">
                    <span>Editing {activeMdFile}</span>
                    <span className="text-[10px] text-neutral-500">Auto-saved to Agent</span>
                  </div>
                  <textarea
                    className={`${inputClass} resize-y font-mono text-xs ${isMaximized ? "flex-1 min-h-36" : "min-h-28"}`}
                    value={docs[activeMdFile] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDocs((prev) => ({ ...prev, [activeMdFile]: val }));
                      if (activeMdFile === "SOUL.md") setSoul(val);
                    }}
                    placeholder={`Nội dung định dạng Markdown cho ${activeMdFile}...`}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Cột 2: Memory & Skills */}
          <div className={isMaximized ? "flex flex-col gap-5 h-full flex-1 min-h-0 pr-1" : "flex flex-col gap-4"}>
            <div className="text-xs text-neutral-400 flex flex-col shrink-0">
              Memory — what it remembers
              <div className="mt-1 flex flex-col gap-1.5">
                {memory.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200"
                  >
                    <span className="min-w-0 flex-1 truncate">{m}</span>
                    <button
                      onClick={() =>
                        setMemory((mem) => mem.filter((_, idx) => idx !== i))
                      }
                      className="cursor-pointer rounded p-0.5 text-neutral-500 hover:text-red-400"
                      title="Forget"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} flex-1`}
                    value={newMemory}
                    onChange={(e) => setNewMemory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addMemory();
                      }
                    }}
                    placeholder="e.g. Always sign emails as “The V Team”."
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={addMemory}
                    disabled={!newMemory.trim()}
                  >
                    <Plus className="size-3.5" /> Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="text-xs text-neutral-400 flex flex-col flex-1 min-h-0">
              Skills — enabled capabilities
              <div className={`mt-2 flex flex-col gap-1.5 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3 flex-1 ${isMaximized ? "min-h-[420px]" : "min-h-[220px]"}`}>
                {allSkills.map((s) => {
                  const checked = enabledSkills.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg p-1.5 hover:bg-neutral-900"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEnabledSkills((prev) => [...prev, s.id]);
                          } else {
                            setEnabledSkills((prev) => prev.filter((id) => id !== s.id));
                          }
                        }}
                        className="mt-0.5 rounded border-neutral-700 bg-neutral-900 text-gold-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-200">
                          <span>{s.emoji}</span>
                          <span>{s.name}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-neutral-500 leading-normal line-clamp-1">
                          {s.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
                {allSkills.length === 0 && (
                  <div className="text-center text-xs text-neutral-600 py-2">
                    No skills installed.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 shrink-0 border-t border-neutral-800/60 pt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            title="Export configuration as Markdown file"
          >
            <Download className="size-3.5" /> Export MD
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onSave({
                instructions: instructions.trim() || undefined,
                soul: (docs["SOUL.md"] || soul).trim() || undefined,
                memory: memory.length ? memory : undefined,
                skills: enabledSkills,
                docs: Object.keys(docs).length ? docs : undefined,
              })
            }
          >
            Save
          </Button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-neutral-600 shrink-0">
          These steer the agent in every chat — its instructions and soul are
          sent to the model as guidance.
        </p>
      </div>
    </div>
  );
}
