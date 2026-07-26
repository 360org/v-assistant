import type { ProviderId } from "@/lib/catalog";
import type { ChatMessage, ChatOptions } from "@/runtime/engine";
import type { ProviderConfig } from "@/runtime/providers";
import type { AgentTemplate } from "@/lib/catalog";
import type { ImportedAgent } from "@/runtime/agentImport";

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
  type: string;
  uploadedAt: string;
  chunkCount: number;
  status: KnowledgeStatus;
  dataUrl?: string;
  sourceUrl?: string;
  extractedText?: string;
  errorMessage?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  agentId?: string;
}

export interface LocalUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
  bio?: string;
  createdAt: string;
  authProvider?: "antigravity" | "codex" | "claude" | "grok-cli";
}

export interface AppState {
  view: View;
  setView: (v: View) => void;
  user: LocalUser | null;
  onboarded: boolean;
  activeProviderId: ProviderId;
  providerConfigs: Record<ProviderId, ProviderConfig>;
  activeModel: string;
  chatOptions: ChatOptions;

  installedAgents: (AgentTemplate | ImportedAgent)[];
  activeAgentId: string;
  setActiveAgent: (agentId: string) => void;
  installAgent: (agent: AgentTemplate | ImportedAgent) => void;
  uninstallAgent: (agentId: string) => void;
  updateAgentSkill: (agentId: string, skillName: string, enabled: boolean) => void;

  knowledgeFiles: KnowledgeFile[];
  addKnowledgeFile: (f: File) => Promise<KnowledgeFile>;
  removeKnowledgeFile: (id: string) => void;
  clearKnowledgeBase: () => void;

  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  clearChat: () => void;
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  createChatSession: (initialTitle?: string) => string;
  switchChatSession: (sessionId: string) => void;
  renameChatSession: (sessionId: string, newTitle: string) => void;
  deleteChatSession: (sessionId: string) => void;

  selfImprove: boolean;
  setSelfImprove: (v: boolean) => void;

  customDataPath: string;
  setCustomDataPath: (path: string) => void;

  language: "vi" | "en";
  setLanguage: (lang: "vi" | "en") => void;

  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;

  chatDraft: string;
  setChatDraft: (draft: string) => void;
  consumeChatDraft: () => string;

  updateLocalUser: (fields: Partial<LocalUser>) => void;
  ensureLocalUser: (fields?: Partial<LocalUser>) => LocalUser;
  clearLocalUser: () => void;

  exportFullBackupData: () => string;
  importFullBackupData: (jsonStr: string) => boolean;

  resetApp: () => void;
}
