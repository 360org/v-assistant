import { useState } from "react";
import { Check, Download, MessageSquare, Settings2, X } from "lucide-react";
import { AGENT_STORE, type AgentTemplate } from "@/lib/catalog";
import { useApp, type AgentConfig } from "@/lib/store";
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
  } = useApp();
  const [installing, setInstalling] = useState<string | null>(null);
  const [configFor, setConfigFor] = useState<AgentTemplate | null>(null);

  const install = (id: string) => {
    // One click. No GitHub, no config — the store handles everything.
    setInstalling(id);
    setTimeout(() => {
      toggleAgent(id);
      setInstalling(null);
      // Give the engine the new agent's group (best-effort, invisible).
      void syncAgents(
        AGENT_STORE.filter(
          (a) => a.id === id || installedAgents.includes(a.id),
        ).map(({ id, name, description }) => ({ id, name, description })),
      );
    }, 600);
  };

  const startChat = (id: string) => {
    setActiveAgent(id);
    setView("chat");
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Agent Store</h1>
      <p className="mt-1 text-neutral-400">
        Ready-made experts for your work. Install, then give each one its own
        instructions and personality.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {AGENT_STORE.map((agent) => {
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleAgent(agent.id)}
                    >
                      <Check className="size-3.5 text-emerald-400" /> Installed
                    </Button>
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{agent.emoji}</span>
            <h2 className="font-semibold">Configure {agent.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <label className="text-xs text-neutral-400">
            Instructions — how it works
            <textarea
              className={`${inputClass} mt-1 min-h-28 resize-y`}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={
                "Describe the process/steps this agent should follow, e.g.\n" +
                "1. Ask for the goal\n2. Draft an outline\n3. Write, then review."
              }
            />
          </label>
          <label className="text-xs text-neutral-400">
            Soul — personality & voice
            <textarea
              className={`${inputClass} mt-1 min-h-20 resize-y`}
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              placeholder="Warm, concise, a little witty. Speaks like a trusted colleague."
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onSave({
                instructions: instructions.trim() || undefined,
                soul: soul.trim() || undefined,
              })
            }
          >
            Save
          </Button>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">
          These steer the agent in every chat — its instructions and soul are
          sent to the model as guidance.
        </p>
      </div>
    </div>
  );
}
