import { createContext, useContext, useState, type ReactNode } from "react";
import { AGENT_STORE, type AgentTemplate } from "@/lib/catalog";
import type { ImportedAgent } from "@/runtime/agentImport";

export interface AgentState {
  installedAgents: (AgentTemplate | ImportedAgent)[];
  activeAgentId: string;
  setActiveAgent: (agentId: string) => void;
  installAgent: (agent: AgentTemplate | ImportedAgent) => void;
  uninstallAgent: (agentId: string) => void;
}

const AgentStateContext = createContext<AgentState | null>(null);

export function AgentStateProvider({ children }: { children: ReactNode }) {
  const [installedAgents, setInstalledAgents] = useState<(AgentTemplate | ImportedAgent)[]>(() => AGENT_STORE);
  const [activeAgentId, setActiveAgentId] = useState<string>("general");

  const setActiveAgent = (agentId: string) => {
    setActiveAgentId(agentId);
  };

  const installAgent = (agent: AgentTemplate | ImportedAgent) => {
    setInstalledAgents((prev) => [...prev.filter((a) => a.id !== agent.id), agent]);
  };

  const uninstallAgent = (agentId: string) => {
    setInstalledAgents((prev) => prev.filter((a) => a.id !== agentId));
  };

  return (
    <AgentStateContext.Provider
      value={{
        installedAgents,
        activeAgentId,
        setActiveAgent,
        installAgent,
        uninstallAgent,
      }}
    >
      {children}
    </AgentStateContext.Provider>
  );
}

export function useAgentState() {
  const ctx = useContext(AgentStateContext);
  if (!ctx) throw new Error("useAgentState must be used within AgentStateProvider");
  return ctx;
}
