import pkg from "../../package.json";

const SECRET_KEYS = /api[_-]?key|token|secret|password|refresh|authorization|credential/i;

type AppStoreSnapshot = {
  provider: unknown;
  providerConfigs: unknown;
  installedEngineSkills: string[];
  mcpServers: Record<string, unknown>;
  connectedIntegrations: string[];
  knowledgeFiles: unknown[];
  scheduledTasks: unknown[];
  taskRunLogs: unknown[];
  chatSessions: unknown[];
  activeAgentId: string | null;
  customSkills: Array<{ raw: string; source: string }>;
};

function redact(value: unknown, key = ""): unknown {
  if (SECRET_KEYS.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  }
  return value;
}

export interface DiagnosticsBundle {
  app: { version: string; userAgent: string; tauri: boolean };
  counts: Record<string, number>;
  capabilitySources: string[];
  state: unknown;
}

export function buildDiagnosticsBundle(state: AppStoreSnapshot): DiagnosticsBundle {
  const capabilitySources = [
    "Skills",
    "Native tools tích hợp",
    state.mcpServers && Object.keys(state.mcpServers).length ? "MCP" : "MCP: chưa cấu hình",
    state.connectedIntegrations.length ? "Connectors" : "Connectors: chưa kết nối",
    state.knowledgeFiles.length ? "Knowledge" : "Knowledge: chưa có tài liệu",
    state.scheduledTasks.length ? "Scheduled" : "Scheduled: chưa có lịch",
  ];

  return {
    app: {
      version: pkg.version,
      userAgent: navigator.userAgent,
      tauri: typeof window !== "undefined" && "__TAURI_INTERNALS__" in window,
    },
    counts: {
      customSkills: state.customSkills.length,
      installedEngineSkills: state.installedEngineSkills.length,
      mcpServers: Object.keys(state.mcpServers ?? {}).length,
      connectedIntegrations: state.connectedIntegrations.length,
      knowledgeFiles: state.knowledgeFiles.length,
      scheduledTasks: state.scheduledTasks.length,
      taskRunLogs: state.taskRunLogs.length,
      chatSessions: state.chatSessions.length,
    },
    capabilitySources,
    state: redact({
      provider: state.provider,
      providerConfigs: state.providerConfigs,
      installedEngineSkills: state.installedEngineSkills,
      mcpServers: state.mcpServers,
      connectedIntegrations: state.connectedIntegrations,
      activeAgentId: state.activeAgentId,
      customSkills: state.customSkills.map((skill) => ({ source: skill.source, bytes: skill.raw.length })),
      scheduledTasks: state.scheduledTasks,
      taskRunLogs: state.taskRunLogs.slice(0, 20),
      knowledgeFiles: state.knowledgeFiles,
    }),
  };
}
