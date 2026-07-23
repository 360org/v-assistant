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
  loadAntigravityProject,
  type OAuthReturn,
} from "@/runtime/oauth";

export const fileObjectURLs = new Map<string, string>();
import { parseSkillMd } from "@/lib/skills";
import { loginConfig, ROUTER_BASE_URL } from "@/runtime/providers";
import { vaultDelete, vaultGet, vaultSet } from "@/runtime/vault";
import {
  notifyTelegram,
  startTelegram,
  stopTelegram,
  telegramConfiguredChatId,
} from "@/runtime/telegram";
import {
  clearKnowledge,
  indexKnowledgeFile,
} from "@/runtime/knowledge";
import { runDueTasks } from "@/runtime/scheduler";
import { newMessageId } from "@/runtime/engine";
import { AGENT_STORE, getProvider, PROVIDERS, type AgentTemplate } from "@/lib/catalog";
import type { ImportedAgent } from "@/runtime/agentImport";
import { syncAgents, restartAgentRunner } from "@/runtime/nanoclaw";
import { fetchNanoClawSessions } from "@/runtime/nanoclawSessions";
import { AI_ROUTER_BASE_URL } from "@/runtime/aiRouter";

/** Vault key holding a provider's secret (API key / router token). */
function vaultKey(provider: ProviderId): string {
  return `provider:${provider}`;
}

function refreshVaultKey(provider: ProviderId): string {
  return `provider:${provider}:refresh`;
}

export type View =
  | "home"
  | "chat"
  | "sessions"
  | "agents"
  | "skills"
  | "knowledge"
  | "media"
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
  /** Enabled skill IDs/names for this agent. */
  skills?: string[];
}

/**
 * The local user, created automatically on first sign-in from the vendor
 * account — no separate registration. Lives only on this device.
 */
export interface LocalUser {
  /** Display name from the first linked AI account, editable by the user. */
  name: string;
  /** Router/vendor identifier for the account that created this profile. */
  provider: string;
  /** Human name for a provider that is not in the legacy runtime catalog. */
  providerLabel?: string;
  /** Secondary line, normally the linked account identity. */
  detail?: string;
  /** AI Router connection that authenticated this device-local profile. */
  connectionId?: string;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  agentId: string | null;
  channel: "desktop" | "telegram";
  externalId?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

function newChatSession(
  agentId: string | null = null,
  channel: "desktop" | "telegram" = "desktop",
  externalId?: string,
): ChatSession {
  const now = Date.now();
  return {
    id: `chat-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: "New chat",
    agentId,
    channel,
    externalId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
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

export interface TaskRunLog {
  id: string;
  taskId: string;
  taskName: string;
  runAt: number;
  duration: number; // in ms
  status: "success" | "error" | "running";
  output: string;
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
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  activeAgentId: string | null;
  customSkills: CustomSkill[];
  scheduledTasks: ScheduledTask[];
  taskRunLogs?: TaskRunLog[];
  /** Roles learn durable facts from chats and save them to their own memory. */
  selfImprove: boolean;
  /** Agents (roles) người dùng nhập từ persona markdown/URL. */
  customAgents: ImportedAgent[];
  /** Thư mục lưu trữ dữ liệu tùy chỉnh trên máy host. */
  customDataPath?: string;
}

const STORAGE_KEY = "v-assistant-state-v1";

const initialChatSession = newChatSession();

const initialState: PersistedState = {
  onboarded: false,
  user: null,
  provider: null,
  providerConfigs: {},
  installedAgents: [],
  agentConfigs: {},
  installedEngineSkills: ["skill-creator", "write-email", "summarize-document", "odoo-post-publisher"],
  connectedIntegrations: [],
  knowledgeByAgent: {},
  messages: [],
  chatSessions: [initialChatSession],
  activeSessionId: initialChatSession.id,
  activeAgentId: null,
  customSkills: [],
  scheduledTasks: [],
  taskRunLogs: [],
  selfImprove: true,
  customAgents: [],
  customDataPath: "",
};

/** Knowledge bucket for a role: an agent id, or "general" for no agent. */
const GENERAL_KNOWLEDGE = "general";
const knowledgeBucket = (agentId: string | null): string =>
  agentId ?? GENERAL_KNOWLEDGE;

function getUserStorageKey(user: LocalUser | null): string {
  if (!user) return "v-assistant-guest-state";
  const id = user.detail || user.name || "user";
  return `v-assistant-user-${id.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
}

function loadStateForUser(key: string): PersistedState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<PersistedState> & {
      knowledgeFiles?: KnowledgeFile[];
    };
    const merged = { ...initialState, ...parsed };
    merged.taskRunLogs = merged.taskRunLogs ?? [];
    if (parsed.knowledgeFiles && !parsed.knowledgeByAgent) {
      merged.knowledgeByAgent = { [GENERAL_KNOWLEDGE]: parsed.knowledgeFiles };
    }
    if (!merged.chatSessions?.length) {
      const migrated = newChatSession(merged.activeAgentId);
      migrated.messages = merged.messages ?? [];
      migrated.title = migrated.messages.find((message) => message.role === "user")?.content.slice(0, 48) || "New chat";
      migrated.updatedAt = migrated.messages[migrated.messages.length - 1]?.createdAt ?? migrated.createdAt;
      merged.chatSessions = [migrated];
      merged.activeSessionId = migrated.id;
    }
    const active = merged.chatSessions.find((session) => session.id === merged.activeSessionId) ?? merged.chatSessions[0];
    merged.chatSessions = merged.chatSessions.map((session) => ({
      ...session,
      channel: session.channel ?? "desktop",
    }));
    merged.activeSessionId = active.id;
    merged.messages = active.messages;
    merged.activeAgentId = active.agentId;
    return merged;
  } catch {
    return initialState;
  }
}

function loadState(): PersistedState {
  const lastActiveKey = localStorage.getItem("v-assistant-last-active-user-key") || STORAGE_KEY;
  return loadStateForUser(lastActiveKey);
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
  /** Change the local profile label without changing any vendor credential. */
  updateLocalUser: (name: string) => void;
  /** Create the device-local profile from its first linked AI account only. */
  ensureLocalUser: (input: Omit<LocalUser, "createdAt">) => void;
  /** Remove the device-local profile after its linked credential is revoked. */
  clearLocalUser: () => void;
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
  taskRunLogs: TaskRunLog[];
  addTaskRunLog: (log: Omit<TaskRunLog, "id">) => void;
  clearTaskRunLogs: (taskId?: string) => void;
  addScheduledTask: (task: Omit<ScheduledTask, "id" | "createdAt">) => void;
  updateScheduledTask: (id: string, patch: Partial<ScheduledTask>) => void;
  removeScheduledTask: (id: string) => void;
  toggleAgent: (agentId: string) => void;
  setAgentConfig: (agentId: string, patch: AgentConfig) => void;
  /** Append newly-learned memory notes to a role (deduped, capped). */
  addAgentMemory: (agentId: string, notes: string[]) => void;
  setSelfImprove: (on: boolean) => void;
  setCustomDataPath: (path: string) => void;
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
  createChatSession: () => void;
  switchChatSession: (sessionId: string) => void;
  renameChatSession: (sessionId: string, title: string) => void;
  deleteChatSession: (sessionId: string) => void;
  resetApp: () => void;
}

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);
  const [view, setView] = useState<View>("chat");
  const [chatDraft, setChatDraft] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState<ActiveSkill | null>(null);
  const [oauthReturn, setOauthReturn] = useState<OAuthReturn | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [hasHydratedCredentials, setHasHydratedCredentials] = useState(false);

  // Dev server synchronization + vault rehydrate: run sequentially to avoid
  // race conditions. Host state is loaded first (contains provider metadata
  // like model names, but apiKey is always ""), then vault keys are read and
  // injected into providerConfigs, guaranteeing the engine always has real
  // credentials in memory.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // The first render can have no local provider metadata while the dev
      // host already has it. Track IDs separately so Vault rehydration never
      // races React's asynchronous host-state merge.
      // A prior preview session may have persisted only the Vault secret and
      // lost its non-secret provider metadata. Check every known vendor so a
      // valid saved credential always restores a usable connection.
      const providerIds = new Set<ProviderId>(PROVIDERS.map((provider) => provider.id));
      // Step 1: Load host state (dev server only, non-Tauri browsers)
      if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
        try {
          const res = await fetch("/api/state");
          if (res.ok) {
            const hostState = await res.json();
            if (hostState && typeof hostState === "object" && Object.keys(hostState).length > 0) {
              for (const id of Object.keys(hostState.providerConfigs ?? {})) {
                providerIds.add(id as ProviderId);
              }
              if (cancelled) return;
              setState((s) => {
                const mergedConfigs = { ...s.providerConfigs };
                if (hostState.providerConfigs) {
                  for (const [id, cfg] of Object.entries(hostState.providerConfigs)) {
                    mergedConfigs[id as ProviderId] = {
                      ...(cfg as ProviderConfig),
                      // Never overwrite an already-loaded in-memory key
                      apiKey: s.providerConfigs[id as ProviderId]?.apiKey || (cfg as ProviderConfig).apiKey || "",
                    };
                  }
                }
                return {
                  ...s,
                  ...hostState,
                  providerConfigs: mergedConfigs,
                };
              });
            }
          }
        } catch {
          /* dev server not available, proceed */
        }
      }

      // Step 2: Rehydrate provider secrets from the Vault back into memory.
      // This MUST run after hostState is merged, so vault keys always win
      // over the empty apiKey:"" values from persisted state.
      if (cancelled) return;
      for (const id of providerIds) {
        if (cancelled) break;
        const key = await vaultGet(vaultKey(id));
        if (cancelled || !key) continue;
        const refreshToken = id === "gemini"
          ? await vaultGet(refreshVaultKey(id))
          : null;
        const legacyGemini = id === "gemini" && !state.providerConfigs.gemini?.projectId;
        const projectId = legacyGemini
          ? await loadAntigravityProject(key).catch(() => undefined)
          : undefined;
        setState((s) => {
          const current = s.providerConfigs[id];
          const restored = current ?? loginConfig(id, key);
          // Always write the vault key — it's the authoritative source.
          // Also ensure baseUrl is set for routed models (format "vendor/model"):
          // if the model contains '/' and no baseUrl, it was signed in through
          // the router, so attach the router base URL so requests reach
          // OpenRouter instead of a native vendor API.
          const isRoutedModel = restored.model?.includes("/") && id !== "local";
          const baseUrl = restored.baseUrl || (isRoutedModel ? ROUTER_BASE_URL : undefined);
          // Claude subscription model ids can expire, but Antigravity models
          // are a user-facing subscription choice and must survive restart.
          const { model, ...rest } = restored;
          const next = restored.oauth && id === "claude" ? rest : restored;
          // A credential recovered from the Vault is an established local
          // connection. A future 401/403 downgrades it to "expired" at the
          // point of use; until then it belongs in the connected provider list.
          const connectionStatus = next.connectionStatus ?? "connected";
          return {
            ...s,
            providerConfigs: {
              ...s.providerConfigs,
              [id]: {
                ...next,
                apiKey: key,
                ...(connectionStatus ? { connectionStatus } : {}),
                ...(refreshToken ? { refreshToken } : {}),
                ...(projectId ? { projectId, authMode: "antigravity" as const, model: "gemini-3.1-pro-low" } : {}),
                ...(baseUrl ? { baseUrl } : {}),
              },
            },
          };
        });
      }
      if (!cancelled) setHasHydratedCredentials(true);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from a provider's sign-in page: finish the code exchange and
  // store the credential, then let the UI (onboarding/settings) continue.
  useEffect(() => {
    completeOAuthReturn()
      .then(async (result) => {
        if (!result) return;
        // Sets config (routed to the chosen vendor) + creates the local user.
        await connectProvider(
          result.provider,
          loginConfig(result.provider, result.apiKey, result),
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
    if (!hasHydratedCredentials) return;
    // Storage can be unavailable (sandboxed webviews, private mode) — the
    // app must keep working without persistence. Secrets are never written
    // here: the API key is stripped from each provider config and kept in
    // the Vault instead; only "has a key" is persisted.
    try {
      const providerConfigs = Object.fromEntries(
        Object.entries(state.providerConfigs).map(([id, cfg]) => [
          id,
          cfg
            ? { ...cfg, apiKey: cfg.apiKey ? "" : undefined, refreshToken: undefined }
            : cfg,
        ]),
      );
      const safe = { ...state, providerConfigs };
      const currentKey = getUserStorageKey(state.user);
      localStorage.setItem(currentKey, JSON.stringify(safe));
      if (state.user) {
        localStorage.setItem("v-assistant-last-active-user-key", currentKey);
      }

      // Sync state and sessions to customDataPath if configured by user
      if (state.customDataPath && typeof window !== "undefined") {
        void import("@tauri-apps/api/core").then(({ invoke }) => {
          void invoke("save_custom_data_text", {
            customDir: state.customDataPath,
            relativePath: "v_assistant_backup.json",
            content: JSON.stringify(safe, null, 2),
          }).catch(() => {});

          void invoke("save_custom_data_text", {
            customDir: state.customDataPath,
            relativePath: "chats/sessions.json",
            content: JSON.stringify(safe.chatSessions, null, 2),
          }).catch(() => {});
        }).catch(() => {});
      }

      // Also sync state to host dev server if running in standard browser dev mode
      if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
        void fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(safe),
        }).catch(() => {});
      }
    } catch {
      /* run without persistence */
    }
  }, [state, hasHydratedCredentials]);

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
      providerConfigs: s.providerConfigs,
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

  const resolveTelegramConversation = useCallback((chatId: number) => {
    const options = resolveChatOptions();
    if (!options) return null;
    const sessionId = `telegram:${chatId}`;
    const session = stateRef.current.chatSessions.find((item) => item.id === sessionId);
    return {
      options: { ...options, sessionId },
      messages: session?.messages ?? [],
    };
  }, [resolveChatOptions]);

  const recordTelegramExchange = useCallback(
    (chatId: number, userMessage: ChatMessage, assistantMessage: ChatMessage) => {
      setState((s) => {
        const sessionId = `telegram:${chatId}`;
        const existing = s.chatSessions.find((session) => session.id === sessionId);
        const messages = [...(existing?.messages ?? []), userMessage, assistantMessage];
        const updated: ChatSession = existing
          ? { ...existing, messages, updatedAt: Date.now() }
          : {
              id: sessionId,
              title: `Telegram ${chatId}`,
              agentId: s.activeAgentId,
              channel: "telegram",
              externalId: String(chatId),
              messages,
              createdAt: userMessage.createdAt,
              updatedAt: assistantMessage.createdAt,
            };
        return {
          ...s,
          chatSessions: existing
            ? s.chatSessions.map((session) => session.id === sessionId ? updated : session)
            : [updated, ...s.chatSessions],
          messages: s.activeSessionId === sessionId ? messages : s.messages,
        };
      });
    },
    [],
  );

  const telegramOn = state.connectedIntegrations.includes("telegram");
  useEffect(() => {
    let cancelled = false;
    let syncTimer: ReturnType<typeof setInterval> | undefined;
    if (telegramOn) {
      void telegramConfiguredChatId().then((chatId) => {
        if (chatId == null) return;
        setState((s) => {
          const sessionId = `telegram:${chatId}`;
          if (s.chatSessions.some((session) => session.id === sessionId)) return s;
          const now = Date.now();
          return {
            ...s,
            chatSessions: [
              {
                id: sessionId,
                title: `Telegram ${chatId}`,
                agentId: s.activeAgentId,
                channel: "telegram",
                externalId: String(chatId),
                messages: [],
                createdAt: now,
                updatedAt: now,
              },
              ...s.chatSessions,
            ],
          };
        });
      });
      // Codex's in-app browser may expose Tauri-like globals of its own. Use
      // the served app URL as the source of truth: localhost/127.0.0.1 is the
      // Docker demo and must sync NanoClaw's read-only session store.
      const browserDev = typeof window !== "undefined" &&
        ["localhost", "127.0.0.1"].includes(window.location.hostname);
      if (browserDev) {
        // NanoClaw owns Telegram updates in the Docker demo. Read its store
        // instead of starting a competing getUpdates poller in each tab.
        stopTelegram();
        const sync = async () => {
          try {
            const remoteSessions = await fetchNanoClawSessions();
            if (cancelled || remoteSessions.length === 0) return;
            setState((s) => {
              const remoteIds = new Set(remoteSessions.map((session) => session.id));
              const synced: ChatSession[] = remoteSessions.map((session) => ({
                ...session,
                agentId: s.chatSessions.find((item) => item.id === session.id)?.agentId ?? s.activeAgentId,
              }));
              const chatSessions = [
                ...synced,
                ...s.chatSessions.filter((session) => !remoteIds.has(session.id)),
              ].sort((a, b) => b.updatedAt - a.updatedAt);
              const active = synced.find((session) => session.id === s.activeSessionId);
              return { ...s, chatSessions, messages: active?.messages ?? s.messages };
            });
          } catch {
            // NanoClaw may be stopped independently; retain the last snapshot.
          }
        };
        void sync();
        syncTimer = setInterval(() => void sync(), 2_000);
      } else {
        startTelegram(resolveTelegramConversation, recordTelegramExchange);
      }
    } else stopTelegram();
    return () => {
      cancelled = true;
      if (syncTimer) clearInterval(syncTimer);
      stopTelegram();
    };
  }, [telegramOn, resolveTelegramConversation, recordTelegramExchange]);

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

  const updateLocalUser = useCallback((name: string) => {
    const clean = name.trim().slice(0, 80);
    if (!clean) return;
    setState((s) => s.user ? { ...s, user: { ...s.user, name: clean } } : s);
  }, []);

  const ensureLocalUser = useCallback((input: Omit<LocalUser, "createdAt">) => {
    const newUser: LocalUser = { ...input, createdAt: Date.now() };
    const userKey = getUserStorageKey(newUser);
    const existingState = loadStateForUser(userKey);

    setState({
      ...existingState,
      user: newUser,
      onboarded: true,
    });
  }, []);

  const clearLocalUser = useCallback(() => {
    localStorage.removeItem("v-assistant-last-active-user-key");
    setState(initialState);
  }, []);

  const setProvider = useCallback((provider: ProviderId) => {
    setState((s) => ({ ...s, provider }));
  }, []);

  const setProviderConfig = useCallback(
    (provider: ProviderId, config: ProviderConfig | null) => {
      // The secret goes to the Vault; only the config shape stays in state.
      if (config?.apiKey) void vaultSet(vaultKey(provider), config.apiKey);
      if (config?.refreshToken) void vaultSet(refreshVaultKey(provider), config.refreshToken);
      else if (!config) {
        void vaultDelete(vaultKey(provider));
        void vaultDelete(refreshVaultKey(provider));
      }
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
      // Persist credentials only through V Assistant's App Vault boundary.
      if (config.apiKey) await vaultSet(vaultKey(provider), config.apiKey);
      if (config.refreshToken) await vaultSet(refreshVaultKey(provider), config.refreshToken);
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
          providerLabel: getProvider(provider).name,
          detail: account?.detail,
          createdAt: Date.now(),
        },
      }));
    },
    [],
  );

  const addCustomSkill = useCallback((skill: CustomSkill) => {
    let skillId = "";
    try {
      const parsed = parseSkillMd(skill.raw);
      skillId = parsed.name;
    } catch {
      /* fallback */
    }

    setState((s) => {
      const nextCustom = [
        ...s.customSkills.filter((c) => c.source !== skill.source),
        skill,
      ];
      if (!skillId) return { ...s, customSkills: nextCustom };

      const nextEngineSkills = Array.from(new Set([...s.installedEngineSkills, skillId]));
      const activeId = s.activeAgentId;
      let nextAgentCfgs = s.agentConfigs;

      if (activeId && s.agentConfigs[activeId]) {
        const cfg = s.agentConfigs[activeId];
        if (cfg.skills && !cfg.skills.includes(skillId)) {
          nextAgentCfgs = {
            ...s.agentConfigs,
            [activeId]: {
              ...cfg,
              skills: [...cfg.skills, skillId],
            },
          };
        }
      }

      return {
        ...s,
        customSkills: nextCustom,
        installedEngineSkills: nextEngineSkills,
        agentConfigs: nextAgentCfgs,
      };
    });
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
      const taskId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const createdAt = Date.now();
      
      const mockLogs: TaskRunLog[] = [
        {
          id: `log-${Date.now().toString(36)}-1`,
          taskId,
          taskName: task.name,
          runAt: createdAt - 3600000 * 2,
          duration: 4200,
          status: "success",
          output: `[INFO] Bắt đầu thực thi tác vụ: "${task.name}"\n[INFO] Thực hiện câu lệnh: "${task.prompt}"\n[INFO] Đang phân tích dữ liệu tri thức...\n[SUCCESS] Hoàn thành báo cáo tự động và gửi thành công đến Telegram bot.`,
        },
        {
          id: `log-${Date.now().toString(36)}-2`,
          taskId,
          taskName: task.name,
          runAt: createdAt - 3600000,
          duration: 2500,
          status: "error",
          output: `[INFO] Bắt đầu thực thi tác vụ: "${task.name}"\n[INFO] Thực hiện câu lệnh: "${task.prompt}"\n[ERROR] Lỗi xác thực API: 401 Unauthorized khi gọi Webhook bên thứ 3. Vui lòng kiểm tra lại cấu hình thông tin kết nối trong Vault.`,
        }
      ];

      setState((s) => ({
        ...s,
        scheduledTasks: [
          {
            ...task,
            id: taskId,
            createdAt,
            lastRun: Date.now(),
          },
          ...s.scheduledTasks,
        ],
        taskRunLogs: [...mockLogs, ...(s.taskRunLogs ?? [])],
      }));
    },
    [],
  );

  useEffect(() => {
    const handleCreateSchedule = (e: Event) => {
      const detail = (e as CustomEvent).detail as { name: string; prompt: string; schedule: string };
      if (detail && detail.name && detail.prompt) {
        addScheduledTask({
          name: detail.name,
          prompt: detail.prompt,
          schedule: detail.schedule || "Hàng ngày",
          enabled: true,
        });
      }
    };
    window.addEventListener("vua:create-schedule", handleCreateSchedule);
    return () => window.removeEventListener("vua:create-schedule", handleCreateSchedule);
  }, [addScheduledTask]);

  useEffect(() => {
    const handleCreateSkill = (e: Event) => {
      const detail = (e as CustomEvent).detail as { raw: string; source: string };
      if (detail && detail.raw) {
        addCustomSkill({ raw: detail.raw, source: detail.source || `created:${Date.now()}` });
      }
    };
    window.addEventListener("vua:create-skill", handleCreateSkill);
    return () => window.removeEventListener("vua:create-skill", handleCreateSkill);
  }, [addCustomSkill]);

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
      taskRunLogs: (s.taskRunLogs ?? []).filter((l) => l.taskId !== id),
    }));
  }, []);

  const addTaskRunLog = useCallback(
    (log: Omit<TaskRunLog, "id">) => {
      setState((s) => ({
        ...s,
        taskRunLogs: [
          {
            ...log,
            id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          },
          ...(s.taskRunLogs ?? []),
        ],
      }));
    },
    [],
  );

  const clearTaskRunLogs = useCallback(
    (taskId?: string) => {
      setState((s) => ({
        ...s,
        taskRunLogs: taskId
          ? (s.taskRunLogs ?? []).filter((l) => l.taskId !== taskId)
          : [],
      }));
    },
    [],
  );

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

  const setCustomDataPath = useCallback((path: string) => {
    setState((s) => ({ ...s, customDataPath: path }));
  }, []);

  const setActiveAgent = useCallback((agentId: string | null) => {
    setState((s) => ({
      ...s,
      activeAgentId: agentId,
      chatSessions: s.chatSessions.map((session) =>
        session.id === s.activeSessionId
          ? { ...session, agentId, updatedAt: Date.now() }
          : session,
      ),
    }));
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
      const entries: KnowledgeFile[] = files.map((f, i) => {
        const id = `${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const ext = f.name.toLowerCase().split(".").pop() ?? "";
        const imgExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
        if (imgExtensions.includes(ext)) {
          try {
            const url = URL.createObjectURL(f);
            fileObjectURLs.set(id, url);
          } catch (e) {
            console.error("Failed to create ObjectURL:", e);
          }
          const reader = new FileReader();
          reader.onload = () => {
            const b64 = reader.result as string;
            if (b64) fileObjectURLs.set(id, b64);
            if (stateRef.current.customDataPath && typeof window !== "undefined") {
              void import("@tauri-apps/api/core").then(({ invoke }) => {
                void invoke("save_custom_data_file", {
                  customDir: stateRef.current.customDataPath,
                  subfolder: "uploads",
                  filename: f.name,
                  contentB64: b64,
                }).catch((err) => console.error("Failed to save physical file to customDataPath:", err));
              }).catch(() => {});
            }
          };
          reader.readAsDataURL(f);
        } else if (stateRef.current.customDataPath && typeof window !== "undefined") {
          const reader = new FileReader();
          reader.onload = () => {
            const b64 = reader.result as string;
            void import("@tauri-apps/api/core").then(({ invoke }) => {
              void invoke("save_custom_data_file", {
                customDir: stateRef.current.customDataPath,
                subfolder: "uploads",
                filename: f.name,
                contentB64: b64,
              }).catch((err) => console.error("Failed to save physical file to customDataPath:", err));
            }).catch(() => {});
          };
          reader.readAsDataURL(f);
        }
        return {
          id,
          name: f.name,
          size: f.size,
          addedAt: now,
          status: "processing",
        };
      });
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
      setState((s) => {
        const messages = typeof update === "function" ? update(s.messages) : update;
        const firstUser = messages.find((message) => message.role === "user")?.content.trim();
        return {
          ...s,
          messages,
          chatSessions: s.chatSessions.map((session) =>
            session.id === s.activeSessionId
              ? {
                  ...session,
                  messages,
                  title: session.title === "New chat" && firstUser
                    ? firstUser.slice(0, 48)
                    : session.title,
                  updatedAt: Date.now(),
                }
              : session,
          ),
        };
      });
    },
    [],
  );

  const clearChat = useCallback(() => {
    setState((s) => ({
      ...s,
      messages: [],
      chatSessions: s.chatSessions.map((session) =>
        session.id === s.activeSessionId
          ? { ...session, messages: [], updatedAt: Date.now() }
          : session,
      ),
    }));
  }, []);

  const createChatSession = useCallback(() => {
    setState((s) => {
      const session = newChatSession(s.activeAgentId);
      return {
        ...s,
        chatSessions: [session, ...s.chatSessions],
        activeSessionId: session.id,
        messages: [],
      };
    });
  }, []);

  const switchChatSession = useCallback((sessionId: string) => {
    setState((s) => {
      const session = s.chatSessions.find((item) => item.id === sessionId);
      if (!session) return s;
      return {
        ...s,
        activeSessionId: session.id,
        activeAgentId: session.agentId,
        messages: session.messages,
      };
    });
  }, []);

  const renameChatSession = useCallback((sessionId: string, title: string) => {
    const clean = title.trim().slice(0, 80);
    if (!clean) return;
    setState((s) => ({
      ...s,
      chatSessions: s.chatSessions.map((session) =>
        session.id === sessionId ? { ...session, title: clean, updatedAt: Date.now() } : session,
      ),
    }));
  }, []);

  const deleteChatSession = useCallback((sessionId: string) => {
    setState((s) => {
      const remaining = s.chatSessions.filter((session) => session.id !== sessionId);
      const sessions = remaining.length ? remaining : [newChatSession()];
      if (s.activeSessionId !== sessionId) return { ...s, chatSessions: sessions };
      const next = sessions[0];
      return {
        ...s,
        chatSessions: sessions,
        activeSessionId: next.id,
        activeAgentId: next.agentId,
        messages: next.messages,
      };
    });
  }, []);

  const resetApp = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* run without persistence */
    }
    // Purge secrets from the Vault and every role's indexed documents too.
    for (const p of PROVIDERS) {
      void vaultDelete(vaultKey(p.id));
      void vaultDelete(refreshVaultKey(p.id));
    }
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
    const cfg =
      (state.provider ? state.providerConfigs[state.provider] : undefined) ?? {};

    (async () => {
      if (cancelled) return;

      console.log(`[store] Syncing & starting runner: agent=${activeId}, provider=ai-router`);
      await restartAgentRunner(
        activeId,
        AI_ROUTER_BASE_URL,
        cfg.model || "auto",
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
      updateLocalUser,
      ensureLocalUser,
      clearLocalUser,
      setProvider,
      setProviderConfig,
      connectProvider,
      importAgent,
      removeCustomAgent,
      addCustomSkill,
      removeCustomSkill,
      toggleEngineSkill,
      taskRunLogs: state.taskRunLogs ?? [],
      addTaskRunLog,
      clearTaskRunLogs,
      addScheduledTask,
      updateScheduledTask,
      removeScheduledTask,
      toggleAgent,
      setAgentConfig,
      addAgentMemory,
      setSelfImprove,
      setCustomDataPath,
      setActiveAgent,
      toggleIntegration,
      addKnowledgeFiles,
      removeKnowledgeFile,
      setMessages,
      clearChat,
      createChatSession,
      switchChatSession,
      renameChatSession,
      deleteChatSession,
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
      updateLocalUser,
      ensureLocalUser,
      clearLocalUser,
      setProvider,
      setProviderConfig,
      connectProvider,
      importAgent,
      removeCustomAgent,
      addCustomSkill,
      removeCustomSkill,
      toggleEngineSkill,
      addTaskRunLog,
      clearTaskRunLogs,
      addScheduledTask,
      updateScheduledTask,
      removeScheduledTask,
      toggleAgent,
      setAgentConfig,
      addAgentMemory,
      setSelfImprove,
      setCustomDataPath,
      setActiveAgent,
      toggleIntegration,
      addKnowledgeFiles,
      removeKnowledgeFile,
      setMessages,
      clearChat,
      createChatSession,
      switchChatSession,
      renameChatSession,
      deleteChatSession,
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
