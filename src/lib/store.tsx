/**
 * App-wide state with localStorage persistence. Deliberately simple: one
 * context, one reducer-less setter API. Everything a fresh install needs to
 * remember (onboarding, provider, agents, integrations, knowledge, chat)
 * lives here.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProviderId } from "@/lib/catalog";
import type { ChatMessage } from "@/runtime/engine";
import type { ProviderConfig } from "@/runtime/providers";

export type View =
  | "home"
  | "chat"
  | "agents"
  | "skills"
  | "knowledge"
  | "integrations"
  | "settings";

export type KnowledgeStatus = "processing" | "ready";

export interface KnowledgeFile {
  id: string;
  name: string;
  size: number;
  addedAt: number;
  status: KnowledgeStatus;
}

/** An external skill installed from a URL (raw SKILL.md, source kept). */
export interface CustomSkill {
  raw: string;
  source: string;
}

interface PersistedState {
  onboarded: boolean;
  provider: ProviderId | null;
  /** Per-provider credentials/config — stored on this device only. */
  providerConfigs: Partial<Record<ProviderId, ProviderConfig>>;
  installedAgents: string[];
  connectedIntegrations: string[];
  knowledgeFiles: KnowledgeFile[];
  messages: ChatMessage[];
  activeAgentId: string | null;
  customSkills: CustomSkill[];
}

const STORAGE_KEY = "v-assistant-state-v1";

const initialState: PersistedState = {
  onboarded: false,
  provider: null,
  providerConfigs: {},
  installedAgents: [],
  connectedIntegrations: [],
  knowledgeFiles: [],
  messages: [],
  activeAgentId: null,
  customSkills: [],
};

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    return { ...initialState, ...(JSON.parse(raw) as Partial<PersistedState>) };
  } catch {
    return initialState;
  }
}

interface AppStore extends PersistedState {
  view: View;
  setView: (view: View) => void;
  /** One-shot draft for the chat composer (set by Skills → Use). */
  chatDraft: string | null;
  useSkill: (prompt: string) => void;
  consumeChatDraft: () => void;
  completeOnboarding: (provider: ProviderId, integrations: string[]) => void;
  setProvider: (provider: ProviderId) => void;
  setProviderConfig: (
    provider: ProviderId,
    config: ProviderConfig | null,
  ) => void;
  addCustomSkill: (skill: CustomSkill) => void;
  removeCustomSkill: (source: string) => void;
  toggleAgent: (agentId: string) => void;
  setActiveAgent: (agentId: string | null) => void;
  toggleIntegration: (integrationId: string) => void;
  addKnowledgeFiles: (files: { name: string; size: number }[]) => void;
  removeKnowledgeFile: (fileId: string) => void;
  setMessages: (
    update: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  clearChat: () => void;
  resetApp: () => void;
}

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);
  const [view, setView] = useState<View>("home");
  const [chatDraft, setChatDraft] = useState<string | null>(null);

  const useSkill = useCallback((prompt: string) => {
    setChatDraft(prompt);
    setView("chat");
  }, []);

  const consumeChatDraft = useCallback(() => setChatDraft(null), []);

  useEffect(() => {
    // Storage can be unavailable (sandboxed webviews, private mode) — the
    // app must keep working without persistence.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* run without persistence */
    }
  }, [state]);

  const completeOnboarding = useCallback(
    (provider: ProviderId, integrations: string[]) => {
      setState((s) => ({
        ...s,
        onboarded: true,
        provider,
        connectedIntegrations: [
          ...new Set([...s.connectedIntegrations, ...integrations]),
        ],
      }));
      setView("chat");
    },
    [],
  );

  const setProvider = useCallback((provider: ProviderId) => {
    setState((s) => ({ ...s, provider }));
  }, []);

  const setProviderConfig = useCallback(
    (provider: ProviderId, config: ProviderConfig | null) => {
      setState((s) => {
        const providerConfigs = { ...s.providerConfigs };
        if (config) providerConfigs[provider] = config;
        else delete providerConfigs[provider];
        return { ...s, providerConfigs };
      });
    },
    [],
  );

  const addCustomSkill = useCallback((skill: CustomSkill) => {
    setState((s) => ({
      ...s,
      customSkills: [
        ...s.customSkills.filter((c) => c.source !== skill.source),
        skill,
      ],
    }));
  }, []);

  const removeCustomSkill = useCallback((source: string) => {
    setState((s) => ({
      ...s,
      customSkills: s.customSkills.filter((c) => c.source !== source),
    }));
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setState((s) => ({
      ...s,
      installedAgents: s.installedAgents.includes(agentId)
        ? s.installedAgents.filter((id) => id !== agentId)
        : [...s.installedAgents, agentId],
      activeAgentId:
        s.activeAgentId === agentId && s.installedAgents.includes(agentId)
          ? null
          : s.activeAgentId,
    }));
  }, []);

  const setActiveAgent = useCallback((agentId: string | null) => {
    setState((s) => ({ ...s, activeAgentId: agentId }));
  }, []);

  const toggleIntegration = useCallback((integrationId: string) => {
    setState((s) => ({
      ...s,
      connectedIntegrations: s.connectedIntegrations.includes(integrationId)
        ? s.connectedIntegrations.filter((id) => id !== integrationId)
        : [...s.connectedIntegrations, integrationId],
    }));
  }, []);

  const addKnowledgeFiles = useCallback(
    (files: { name: string; size: number }[]) => {
      const now = Date.now();
      const entries: KnowledgeFile[] = files.map((f, i) => ({
        id: `${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        size: f.size,
        addedAt: now,
        status: "processing",
      }));
      setState((s) => ({
        ...s,
        knowledgeFiles: [...entries, ...s.knowledgeFiles],
      }));
      // The runtime indexes files in the background; the user never sees
      // embeddings or vector stores — just "Processing" then "Ready".
      for (const entry of entries) {
        const delay = 1200 + Math.random() * 1800;
        setTimeout(() => {
          setState((s) => ({
            ...s,
            knowledgeFiles: s.knowledgeFiles.map((f) =>
              f.id === entry.id ? { ...f, status: "ready" } : f,
            ),
          }));
        }, delay);
      }
    },
    [],
  );

  const removeKnowledgeFile = useCallback((fileId: string) => {
    setState((s) => ({
      ...s,
      knowledgeFiles: s.knowledgeFiles.filter((f) => f.id !== fileId),
    }));
  }, []);

  const setMessages = useCallback(
    (update: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setState((s) => ({
        ...s,
        messages: typeof update === "function" ? update(s.messages) : update,
      }));
    },
    [],
  );

  const clearChat = useCallback(() => {
    setState((s) => ({ ...s, messages: [] }));
  }, []);

  const resetApp = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* run without persistence */
    }
    setState(initialState);
    setView("home");
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      ...state,
      view,
      setView,
      chatDraft,
      useSkill,
      consumeChatDraft,
      completeOnboarding,
      setProvider,
      setProviderConfig,
      addCustomSkill,
      removeCustomSkill,
      toggleAgent,
      setActiveAgent,
      toggleIntegration,
      addKnowledgeFiles,
      removeKnowledgeFile,
      setMessages,
      clearChat,
      resetApp,
    }),
    [
      state,
      view,
      chatDraft,
      useSkill,
      consumeChatDraft,
      completeOnboarding,
      setProvider,
      setProviderConfig,
      addCustomSkill,
      removeCustomSkill,
      toggleAgent,
      setActiveAgent,
      toggleIntegration,
      addKnowledgeFiles,
      removeKnowledgeFile,
      setMessages,
      clearChat,
      resetApp,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppStore {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
