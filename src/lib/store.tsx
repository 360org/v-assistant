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
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ProviderId } from "@/lib/catalog";
import type { ChatMessage, ChatOptions } from "@/runtime/engine";
import type { ProviderConfig } from "@/runtime/providers";
import {
  completeOAuthReturn,
  fetchVendorAccount,
  type OAuthReturn,
} from "@/runtime/oauth";
import { routedConfig } from "@/runtime/providers";
import { vaultDelete, vaultGet, vaultSet } from "@/runtime/vault";
import { notifyTelegram, startTelegram, stopTelegram } from "@/runtime/telegram";
import {
  clearKnowledge,
  deleteKnowledgeFile,
  indexKnowledgeFile,
} from "@/runtime/knowledge";
import { runDueTasks } from "@/runtime/scheduler";
import { newMessageId } from "@/runtime/engine";
import { AGENT_STORE, getProvider, PROVIDERS, type AgentTemplate } from "@/lib/catalog";
import type { ImportedAgent } from "@/runtime/agentImport";
import { syncAgents, restartAgentRunner } from "@/runtime/nanoclaw";

/** Vault key holding a provider's secret (API key / router token). */
function vaultKey(provider: ProviderId): string {
  return `provider:${provider}`;
}

export type View =
  | "home"
  | "chat"
  | "agents"
  | "skills"
  | "knowledge"
  | "vault"
  | "scheduled"
  | "integrations"
  | "settings";

export type KnowledgeStatus = "processing" | "ready" | "error";

export interface KnowledgeFile {
  id: string;
  name: string;
  size: number;
  addedAt: number;
  status: KnowledgeStatus;
  /** How many text chunks were indexed (set when status is "ready"). */
  chunks?: number;
  /** Why indexing failed (set when status is "error"). */
  error?: string;
}

/** An external skill installed from a URL (raw SKILL.md, source kept). */
export interface CustomSkill {
  raw: string;
  source: string;
}

/** The skill steering a chat: its name and full SKILL.md instructions. */
export interface ActiveSkill {
  name: string;
  instructions: string;
}

/** Per-agent configuration: workflow instructions and a personality "soul". */
export interface AgentConfig {
  /** How the agent should work — its process/steps (ChatGPT-style). */
  instructions?: string;
  /** The agent's personality/voice. */
  soul?: string;
  /** Persistent memory notes the agent recalls across chats. */
  memory?: string[];
}

/**
 * The local user, created automatically on first sign-in from the vendor
 * account — no separate registration. Lives only on this device.
 */
export interface LocalUser {
  /** Display name (vendor account label, or the provider name). */
  name: string;
  /** Which vendor the account came from. */
  provider: ProviderId;
  /** Secondary line, e.g. remaining credit. */
  detail?: string;
  createdAt: number;
}

/** A recurring job the assistant runs on a schedule (NanoClaw scheduling). */
export interface ScheduledTask {
  id: string;
  name: string;
  /** What the assistant should do each run. */
  prompt: string;
  /** Human recurrence, e.g. "Every day at 9:00". */
  schedule: string;
  enabled: boolean;
  createdAt: number;
  /** When the task last ran (ms), so it isn't fired twice. */
  lastRun?: number;
}

interface PersistedState {
  onboarded: boolean;
  /** The auto-created local user, or null before first sign-in. */
  user: LocalUser | null;
  provider: ProviderId | null;
  /** Per-provider credentials/config — stored on this device only. */
  providerConfigs: Partial<Record<ProviderId, ProviderConfig>>;
  installedAgents: string[];
  /** Per-agent instructions + soul, keyed by agent id. */
  agentConfigs: Record<string, AgentConfig>;
  /** NanoClaw engine skills the user has installed (channel/provider/etc). */
  installedEngineSkills: string[];
  connectedIntegrations: string[];
  /**
   * Knowledge is isolated per role: each agent id (or "general" for the base
   * assistant) has its own bucket, so switching roles never mixes knowledge.
   */
  knowledgeByAgent: Record<string, KnowledgeFile[]>;
  messages: ChatMessage[];
  activeAgentId: string | null;
  customSkills: CustomSkill[];
  scheduledTasks: ScheduledTask[];
  /** Roles learn durable facts from chats and save them to their own memory. */
  selfImprove: boolean;
  /** Agents (roles) người dùng nhập từ persona markdown/URL. */
  customAgents: ImportedAgent[];
}

const STORAGE_KEY = "v-assistant-state-v1";

const initialState: PersistedState = {
  onboarded: false,
  user: null,
  provider: null,
  providerConfigs: {},
  installedAgents: [],
  agentConfigs: {},
  installedEngineSkills: [],
  connectedIntegrations: [],
  knowledgeByAgent: {},
  messages: [],
  activeAgentId: null,
  customSkills: [],
  scheduledTasks: [],
  selfImprove: true,
  customAgents: [],
};

/** Knowledge bucket for a role: an agent id, or "general" for no agent. */
const GENERAL_KNOWLEDGE = "general";
const knowledgeBucket = (agentId: string | null): string =>
  agentId ?? GENERAL_KNOWLEDGE;

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<PersistedState> & {
      knowledgeFiles?: KnowledgeFile[];
    };
    const merged = { ...initialState, ...parsed };
    // Migrate the old global knowledge list into the base ("general") bucket.
    if (parsed.knowledgeFiles && !parsed.knowledgeByAgent) {
      merged.knowledgeByAgent = { [GENERAL_KNOWLEDGE]: parsed.knowledgeFiles };
    }
    return merged;
  } catch {
    return initialState;
  }
}

interface AppStore extends PersistedState {
  view: View;
  setView: (view: View) => void;
  /** One-shot draft for the chat composer (set by Skills → Use). */
  chatDraft: string | null;
  /** The skill whose instructions are steering the current chat, if any. */
  activeSkill: ActiveSkill | null;
  useSkill: (prompt: string, skill?: ActiveSkill) => void;
  clearActiveSkill: () => void;
  consumeChatDraft: () => void;
  /** Set when the app just returned from a provider sign-in redirect. */
  oauthReturn: OAuthReturn | null;
  /** Error from a failed sign-in return, for the UI to surface. */
  oauthError: string | null;
  completeOnboarding: (provider: ProviderId, integrations: string[]) => void;
  setProvider: (provider: ProviderId) => void;
  setProviderConfig: (
    provider: ProviderId,
    config: ProviderConfig | null,
  ) => void;
  /**
   * Connect a provider and, on first sign-in, create the local user from
   * the vendor account. Makes the provider active.
   */
  connectProvider: (
    provider: ProviderId,
    config: ProviderConfig,
  ) => Promise<void>;
  addCustomSkill: (skill: CustomSkill) => void;
  removeCustomSkill: (source: string) => void;
  toggleEngineSkill: (skillId: string) => void;
  addScheduledTask: (task: Omit<ScheduledTask, "id" | "createdAt">) => void;
  updateScheduledTask: (id: string, patch: Partial<ScheduledTask>) => void;
  removeScheduledTask: (id: string) => void;
  toggleAgent: (agentId: string) => void;
  setAgentConfig: (agentId: string, patch: AgentConfig) => void;
  /** Append newly-learned memory notes to a role (deduped, capped). */
  addAgentMemory: (agentId: string, notes: string[]) => void;
  setSelfImprove: (on: boolean) => void;
  setActiveAgent: (agentId: string | null) => void;
  /** Mọi agent cài được: dựng sẵn (AGENT_STORE) + đã nhập từ ngoài. */
  agents: AgentTemplate[];
  /** Nhập một agent từ persona markdown → cài + kích hoạt persona. */
  importAgent: (agent: ImportedAgent) => void;
  removeCustomAgent: (id: string) => void;
  toggleIntegration: (integrationId: string) => void;
  /** The active role's knowledge (derived from `knowledgeByAgent`). */
  knowledgeFiles: KnowledgeFile[];
  addKnowledgeFiles: (files: File[]) => void;
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
  const [activeSkill, setActiveSkill] = useState<ActiveSkill | null>(null);
  const [oauthReturn, setOauthReturn] = useState<OAuthReturn | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Returning from a provider's sign-in page: finish the code exchange and
  // store the credential, then let the UI (onboarding/settings) continue.
  useEffect(() => {
    completeOAuthReturn()
      .then(async (result) => {
        if (!result) return;
        // Sets config (routed to the chosen vendor) + creates the local user.
        await connectProvider(
          result.provider,
          routedConfig(result.provider, result.apiKey),
        );
        setOauthReturn(result);
      })
      .catch((e) => setOauthError(e instanceof Error ? e.message : String(e)));
    // connectProvider is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useSkill = useCallback((prompt: string, skill?: ActiveSkill) => {
    setChatDraft(prompt);
    setActiveSkill(skill ?? null);
    setView("chat");
  }, []);

  const clearActiveSkill = useCallback(() => setActiveSkill(null), []);

  const consumeChatDraft = useCallback(() => setChatDraft(null), []);

  useEffect(() => {
    // Storage can be unavailable (sandboxed webviews, private mode) — the
    // app must keep working without persistence. Secrets are never written
    // here: the API key is stripped from each provider config and kept in
    // the Vault instead; only "has a key" is persisted.
    try {
      const providerConfigs = Object.fromEntries(
        Object.entries(state.providerConfigs).map(([id, cfg]) => [
          id,
          cfg ? { ...cfg, apiKey: cfg.apiKey ? "" : undefined } : cfg,
        ]),
      );
      const safe = { ...state, providerConfigs };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch {
      /* run without persistence */
    }
  }, [state]);

  // On start, rehydrate provider secrets from the Vault back into memory,
  // where the engine reads them for a request.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = Object.keys(state.providerConfigs) as ProviderId[];
      for (const id of ids) {
        const key = await vaultGet(vaultKey(id));
        if (cancelled || !key) continue;
        setState((s) => {
          const current = s.providerConfigs[id];
          if (!current || current.apiKey) return s;
          return {
            ...s,
            providerConfigs: {
              ...s.providerConfigs,
              [id]: { ...current, apiKey: key },
            },
          };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Telegram channel: while it's connected, run the 2-way bridge so the user
  // can chat with their assistant from Telegram. It resolves the current
  // provider/agent per message from a ref, so switches take effect live and
  // the service itself never needs restarting.
  const stateRef = useRef(state);
  stateRef.current = state;
  const resolveChatOptions = useCallback((): ChatOptions | null => {
    const s = stateRef.current;
    if (!s.provider) return null;
    const config = s.providerConfigs[s.provider];
    if (!config) return null;
    const agent =
      [...AGENT_STORE, ...s.customAgents].find((a) => a.id === s.activeAgentId) ??
      null;
    const agentCfg = agent ? s.agentConfigs[agent.id] : undefined;
    return {
      provider: s.provider,
      config,
      agentName: agent?.name,
      agentDescription: agent?.description,
      agentInstructions: agentCfg?.instructions,
      agentSoul: agentCfg?.soul,
      agentMemory: agentCfg?.memory,
      agentKnowledge: (s.knowledgeByAgent[knowledgeBucket(s.activeAgentId)] ?? [])
        .filter((f) => f.status === "ready")
        .map((f) => f.name),
      agentId: agent?.id,
    };
  }, []);

  const telegramOn = state.connectedIntegrations.includes("telegram");
  useEffect(() => {
    if (telegramOn) startTelegram(resolveChatOptions);
    else stopTelegram();
    return () => stopTelegram();
  }, [telegramOn, resolveChatOptions]);

  // Scheduled tasks: tick once a minute and run whatever is due. Results show
  // up in chat and, when Telegram is connected, are pushed there too.
  useEffect(() => {
    let ticking = false;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        await runDueTasks(stateRef.current.scheduledTasks, new Date(), {
          resolveOptions: resolveChatOptions,
          markRun: (id, at) =>
            setState((s) => ({
              ...s,
              scheduledTasks: s.scheduledTasks.map((t) =>
                t.id === id ? { ...t, lastRun: at } : t,
              ),
            })),
          deliver: async (task, result) => {
            setState((s) => ({
              ...s,
              messages: [
                ...s.messages,
                {
                  id: newMessageId(),
                  role: "assistant",
                  content: `⏰ ${task.name}\n\n${result}`,
                  createdAt: Date.now(),
                },
              ],
            }));
            void notifyTelegram(`⏰ ${task.name}\n\n${result}`);
          },
        });
      } finally {
        ticking = false;
      }
    };
    const timer = setInterval(() => void tick(), 60_000);
    // A short initial delay lets sign-in/rehydration settle before the first
    // check, so a task due "now" fires soon after launch.
    const warmup = setTimeout(() => void tick(), 5_000);
    return () => {
      clearInterval(timer);
      clearTimeout(warmup);
    };
    // resolveChatOptions is stable; the tick reads live state from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveChatOptions]);

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
      // The secret goes to the Vault; only the config shape stays in state.
      if (config?.apiKey) void vaultSet(vaultKey(provider), config.apiKey);
      else if (!config) void vaultDelete(vaultKey(provider));
      setState((s) => {
        const providerConfigs = { ...s.providerConfigs };
        if (config) providerConfigs[provider] = config;
        else delete providerConfigs[provider];
        return { ...s, providerConfigs };
      });
    },
    [],
  );

  const connectProvider = useCallback(
    async (provider: ProviderId, config: ProviderConfig) => {
      // Stash the credential in the OS keychain, not in app storage.
      if (config.apiKey) await vaultSet(vaultKey(provider), config.apiKey);
      setState((s) => ({
        ...s,
        provider,
        providerConfigs: { ...s.providerConfigs, [provider]: config },
      }));
      const account = config.apiKey
        ? await fetchVendorAccount(provider, config.apiKey)
        : null;
      setState((s) => ({
        ...s,
        // First sign-in creates the local user; later connects only fill in
        // details we didn't have yet.
        user: s.user ?? {
          name: account?.label ?? getProvider(provider).name,
          provider,
          detail: account?.detail,
          createdAt: Date.now(),
        },
      }));
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

  const toggleEngineSkill = useCallback((skillId: string) => {
    setState((s) => ({
      ...s,
      installedEngineSkills: s.installedEngineSkills.includes(skillId)
        ? s.installedEngineSkills.filter((id) => id !== skillId)
        : [...s.installedEngineSkills, skillId],
    }));
  }, []);

  const addScheduledTask = useCallback(
    (task: Omit<ScheduledTask, "id" | "createdAt">) => {
      setState((s) => ({
        ...s,
        scheduledTasks: [
          {
            ...task,
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: Date.now(),
            // Seed lastRun to now so a task doesn't back-fire the moment it's
            // created (e.g. a "daily at 9:00" added at 14:00 waits for 9:00).
            lastRun: Date.now(),
          },
          ...s.scheduledTasks,
        ],
      }));
    },
    [],
  );

  const updateScheduledTask = useCallback(
    (id: string, patch: Partial<ScheduledTask>) => {
      setState((s) => ({
        ...s,
        scheduledTasks: s.scheduledTasks.map((t) =>
          t.id === id ? { ...t, ...patch } : t,
        ),
      }));
    },
    [],
  );

  const removeScheduledTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      scheduledTasks: s.scheduledTasks.filter((t) => t.id !== id),
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

  const setAgentConfig = useCallback((agentId: string, patch: AgentConfig) => {
    setState((s) => ({
      ...s,
      agentConfigs: {
        ...s.agentConfigs,
        [agentId]: { ...s.agentConfigs[agentId], ...patch },
      },
    }));
  }, []);

  const MEMORY_CAP = 50;
  const addAgentMemory = useCallback((agentId: string, notes: string[]) => {
    if (!notes.length) return;
    setState((s) => {
      const cfg = s.agentConfigs[agentId] ?? {};
      const memory = cfg.memory ?? [];
      const seen = new Set(memory.map((m) => m.trim().toLowerCase()));
      const fresh = notes
        .map((n) => n.trim())
        .filter((n) => n && !seen.has(n.toLowerCase()));
      if (!fresh.length) return s;
      return {
        ...s,
        agentConfigs: {
          ...s.agentConfigs,
          [agentId]: { ...cfg, memory: [...memory, ...fresh].slice(-MEMORY_CAP) },
        },
      };
    });
  }, []);

  const setSelfImprove = useCallback((on: boolean) => {
    setState((s) => ({ ...s, selfImprove: on }));
  }, []);

  const setActiveAgent = useCallback((agentId: string | null) => {
    setState((s) => ({ ...s, activeAgentId: agentId }));
  }, []);

  // Nhập một agent từ persona markdown: lưu vào customAgents, gieo Soul +
  // Instructions vào cấu hình vai trò, đánh dấu đã cài và chọn làm vai trò hiện tại.
  const importAgent = useCallback((agent: ImportedAgent) => {
    setState((s) => {
      const customAgents = [
        ...s.customAgents.filter((a) => a.id !== agent.id),
        agent,
      ];
      const existing = s.agentConfigs[agent.id] ?? {};
      return {
        ...s,
        customAgents,
        agentConfigs: {
          ...s.agentConfigs,
          [agent.id]: {
            ...existing,
            soul: agent.soul || existing.soul,
            instructions: agent.instructions || existing.instructions,
          },
        },
        installedAgents: [...new Set([...s.installedAgents, agent.id])],
        activeAgentId: agent.id,
      };
    });
  }, []);

  const removeCustomAgent = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      customAgents: s.customAgents.filter((a) => a.id !== id),
      installedAgents: s.installedAgents.filter((x) => x !== id),
      activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
    }));
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
    (files: File[]) => {
      const now = Date.now();
      // Capture the bucket at drop time so status updates land in the same
      // role even if the user switches roles while a file is still indexing.
      const agentId = stateRef.current.activeAgentId;
      const bucket = knowledgeBucket(agentId);
      const entries: KnowledgeFile[] = files.map((f, i) => ({
        id: `${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        size: f.size,
        addedAt: now,
        status: "processing",
      }));
      setState((s) => ({
        ...s,
        knowledgeByAgent: {
          ...s.knowledgeByAgent,
          [bucket]: [...entries, ...(s.knowledgeByAgent[bucket] ?? [])],
        },
      }));
      const patchFile = (id: string, patch: Partial<KnowledgeFile>) =>
        setState((s) => ({
          ...s,
          knowledgeByAgent: {
            ...s.knowledgeByAgent,
            [bucket]: (s.knowledgeByAgent[bucket] ?? []).map((f) =>
              f.id === id ? { ...f, ...patch } : f,
            ),
          },
        }));
      // Real indexing: extract text → chunk → persist in the role's bucket.
      // The user never sees the pipeline — just "Processing" then "Ready".
      for (const [i, file] of files.entries()) {
        const entry = entries[i];
        void indexKnowledgeFile(agentId, entry.id, file)
          .then((chunks) => patchFile(entry.id, { status: "ready", chunks }))
          .catch((e) =>
            patchFile(entry.id, {
              status: "error",
              error: e instanceof Error ? e.message : String(e),
            }),
          );
      }
    },
    [],
  );

  const removeKnowledgeFile = useCallback((fileId: string) => {
    void deleteKnowledgeFile(fileId);
    setState((s) => {
      const key = knowledgeBucket(s.activeAgentId);
      return {
        ...s,
        knowledgeByAgent: {
          ...s.knowledgeByAgent,
          [key]: (s.knowledgeByAgent[key] ?? []).filter((f) => f.id !== fileId),
        },
      };
    });
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
    // Purge secrets from the Vault and every role's indexed documents too.
    for (const p of PROVIDERS) void vaultDelete(vaultKey(p.id));
    void clearKnowledge();
    setState(initialState);
    setView("home");
  }, []);

  // Synchronize agent configs to the runner's instructions.md and soul.md
  useEffect(() => {
    if (!state.installedAgents.length) return;
    const agentsToSync = [...AGENT_STORE, ...state.customAgents]
      .filter((a) => state.installedAgents.includes(a.id))
      .map((a) => {
        const cfg = state.agentConfigs[a.id] ?? {};
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          instructions: cfg.instructions,
          soul: cfg.soul,
        };
      });
    void syncAgents(agentsToSync);
  }, [state.installedAgents, state.agentConfigs]);

  // Restart the Agent Runner whenever active agent, active provider, or provider config changes
  useEffect(() => {
    let cancelled = false;
    const activeId = state.activeAgentId || "default";
    const activeProvider = state.provider ?? "openai";
    const cfg =
      (state.provider ? state.providerConfigs[state.provider] : undefined) ?? {};
    
    (async () => {
      let realKey = cfg.apiKey;
      if (!realKey && activeProvider !== "local") {
        realKey =
          (await vaultGet(`provider:${activeProvider}`).catch(() => null)) ??
          undefined;
      }
      
      if (cancelled) return;
      
      console.log(`[store] Syncing & starting runner: agent=${activeId}, provider=${activeProvider}`);
      await restartAgentRunner(
        activeId,
        activeProvider,
        realKey || null,
        cfg.baseUrl || null,
        cfg.model || null
      );
    })();
    
    return () => {
      cancelled = true;
    };
  }, [state.activeAgentId, state.provider, state.providerConfigs]);

  const value = useMemo<AppStore>(
    () => ({
      ...state,
      // The Knowledge page and Home badge show the active role's knowledge.
      knowledgeFiles:
        state.knowledgeByAgent[knowledgeBucket(state.activeAgentId)] ?? [],
      // Mọi agent cài được: dựng sẵn + đã nhập (đưa về dạng AgentTemplate).
      agents: [
        ...AGENT_STORE,
        ...state.customAgents.map(
          (a): AgentTemplate => ({
            id: a.id,
            name: a.name,
            emoji: a.emoji,
            category: "Đã nhập",
            description: a.description,
          }),
        ),
      ],
      view,
      setView,
      chatDraft,
      useSkill,
      consumeChatDraft,
      activeSkill,
      clearActiveSkill,
      oauthReturn,
      oauthError,
      completeOnboarding,
      setProvider,
      setProviderConfig,
      connectProvider,
      importAgent,
      removeCustomAgent,
      addCustomSkill,
      removeCustomSkill,
      toggleEngineSkill,
      addScheduledTask,
      updateScheduledTask,
      removeScheduledTask,
      toggleAgent,
      setAgentConfig,
      addAgentMemory,
      setSelfImprove,
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
      activeSkill,
      clearActiveSkill,
      oauthReturn,
      oauthError,
      completeOnboarding,
      setProvider,
      setProviderConfig,
      connectProvider,
      importAgent,
      removeCustomAgent,
      addCustomSkill,
      removeCustomSkill,
      toggleEngineSkill,
      addScheduledTask,
      updateScheduledTask,
      removeScheduledTask,
      toggleAgent,
      setAgentConfig,
      addAgentMemory,
      setSelfImprove,
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
