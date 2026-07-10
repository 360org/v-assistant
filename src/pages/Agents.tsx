import { useState } from "react";
import { Check, Download, MessageSquare } from "lucide-react";
import { AGENT_STORE } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Agents() {
  const { installedAgents, toggleAgent, setActiveAgent, setView } = useApp();
  const [installing, setInstalling] = useState<string | null>(null);

  const install = (id: string) => {
    // One click. No GitHub, no config — the store handles everything.
    setInstalling(id);
    setTimeout(() => {
      toggleAgent(id);
      setInstalling(null);
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
        Ready-made experts for your work. One click to install, ready to chat.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {AGENT_STORE.map((agent) => {
          const installed = installedAgents.includes(agent.id);
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
              <div className="mt-4 flex gap-2">
                {installed ? (
                  <>
                    <Button size="sm" onClick={() => startChat(agent.id)}>
                      <MessageSquare className="size-3.5" /> Chat
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
    </div>
  );
}
