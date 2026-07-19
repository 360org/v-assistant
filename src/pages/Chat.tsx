import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Eraser, Layers3, Maximize2, Minimize2, Pencil, Plus, SendHorizonal, Trash2, Wand2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import {
  type ProviderConfig,
} from "@/runtime/providers";
import { createEngine, newMessageId, type ChatMessage } from "@/runtime/engine";
import { reflectAndLearn } from "@/runtime/selfImprove";
import {
  AI_ROUTER_BASE_URL,
  deleteAiRouterPack,
  getAiRouterModels,
  saveAiRouterPack,
  type AiRouterModel,
} from "@/runtime/aiRouter";
import { Logo } from "@/components/Logo";
import { ChatSessionMenu } from "@/components/ChatSessionMenu";
import { MessageContent, visibleAssistantText } from "@/components/MessageContent";
import { cn } from "@/lib/utils";

const engine = createEngine();

function PortalWhen({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? createPortal(children, document.body) : <>{children}</>;
}

export function Chat() {
  const {
    messages,
    setMessages,
    clearChat,
    chatSessions,
    activeSessionId,
    createChatSession,
    switchChatSession,
    renameChatSession,
    deleteChatSession,
    installedAgents,
    activeAgentId,
    setActiveAgent,
    chatDraft,
    consumeChatDraft,
    activeSkill,
    clearActiveSkill,
    agentConfigs,
    knowledgeFiles,
    selfImprove,
    addAgentMemory,
    agents,
  } = useApp();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [routerModels, setRouterModels] = useState<AiRouterModel[]>([]);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState(() => localStorage.getItem("vua:ai-router-model") ?? "");
  const [packEditorOpen, setPackEditorOpen] = useState(false);
  const [packExpanded, setPackExpanded] = useState(false);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [packName, setPackName] = useState("");
  const [packModels, setPackModels] = useState<string[]>([]);
  const [packStrategy, setPackStrategy] = useState<"fallback" | "round-robin">("fallback");
  const [packAccountFilters, setPackAccountFilters] = useState<string[]>([]);
  const [packError, setPackError] = useState<string | null>(null);
  const selectedModel = routerModels.find((model) => model.id === activeModel);
  const modelLabel = selectedModel
    ? `${selectedModel.name}${selectedModel.accountLabel ? ` · ${selectedModel.accountLabel}` : ""}`
    : activeModel;
  const packOptions = routerModels.filter((model) => model.kind === "pack");
  const individualModels = routerModels.filter((model) => model.kind !== "pack");
  const connectedModelAccounts = useMemo(() => {
    const accounts = new Map<string, { id: string; provider: string; label: string; count: number }>();
    for (const model of individualModels) {
      if (!model.connectionId) continue;
      const current = accounts.get(model.connectionId);
      accounts.set(model.connectionId, {
        id: model.connectionId,
        provider: model.provider || "AI",
        label: model.accountLabel || "Account",
        count: (current?.count || 0) + 1,
      });
    }
    return [...accounts.values()];
  }, [individualModels]);
  const filteredPackModels = individualModels.filter((model) =>
    !packExpanded || !model.connectionId || packAccountFilters.includes(model.connectionId)
  );
  const routerConfig: ProviderConfig = {
    baseUrl: AI_ROUTER_BASE_URL,
    model: activeModel,
    router: true,
    connectionStatus: "connected",
  };
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const activeAgent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) ?? null,
    [agents, activeAgentId],
  );
  const installedAgentList = useMemo(
    () => agents.filter((a) => installedAgents.includes(a.id)),
    [agents, installedAgents],
  );
  const refreshRouterModels = useCallback(() => {
    const controller = new AbortController();
    void getAiRouterModels(controller.signal)
      .then((models) => {
        setRouterModels(models);
        setModelLoadError(null);
        setActiveModel((current) => current && models.some((model) => model.id === current)
          ? current
          : models[0]?.id ?? "");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setModelLoadError(error instanceof Error ? error.message : String(error));
      });
    return controller;
  }, []);

  useEffect(() => {
    let activeController = refreshRouterModels();
    const refresh = () => {
      activeController.abort();
      activeController = refreshRouterModels();
    };
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      activeController.abort();
    };
  }, [refreshRouterModels]);

  useEffect(() => {
    if (activeModel) localStorage.setItem("vua:ai-router-model", activeModel);
  }, [activeModel]);

  const openPackEditor = (pack?: AiRouterModel) => {
    setEditingPackId(pack?.id.startsWith("pack:") ? pack.id.slice(5) : null);
    setPackName(pack?.name ?? "");
    setPackModels(pack?.models ?? []);
    setPackStrategy(pack?.strategy ?? "fallback");
    setPackAccountFilters(connectedModelAccounts.map((account) => account.id));
    setPackError(null);
    setPackExpanded(false);
    setPackEditorOpen(true);
  };

  const savePack = async () => {
    setPackError(null);
    try {
      await saveAiRouterPack({
        id: editingPackId ?? undefined,
        name: packName.trim(),
        models: packModels,
        strategy: packStrategy,
        stickyLimit: 1,
        autoSwitch: true,
      });
      setPackEditorOpen(false);
      refreshRouterModels();
    } catch (error) {
      setPackError(error instanceof Error ? error.message : String(error));
    }
  };

  const removePack = async (pack: AiRouterModel) => {
    if (!pack.id.startsWith("pack:")) return;
    try {
      await deleteAiRouterPack(pack.id.slice(5));
      refreshRouterModels();
    } catch (error) {
      setModelLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  // A skill was used: pre-fill the composer and put the cursor at the end.
  useEffect(() => {
    if (chatDraft === null) return;
    setInput(chatDraft);
    consumeChatDraft();
    const el = composerRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(chatDraft.length, chatDraft.length);
    }
  }, [chatDraft, consumeChatDraft]);

  const send = async () => {
    const content = input.trim();
    if (!content || streaming || !activeModel) return;
    setInput("");

    const userMessage: ChatMessage = {
      id: newMessageId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const assistantId = newMessageId();
    const history = [...messages, userMessage];
    setMessages([
      ...history,
      { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
    ]);

    setStreaming(true);
    let rawReplyText = "";
    try {
      for await (const chunk of engine.chat(history, {
        // `openrouter` is only the legacy OpenAI-compatible message shape.
        // Router config prevents the runtime from calling OpenRouter directly.
        provider: "openrouter",
        config: routerConfig,
        agentName: activeAgent?.name,
        agentDescription: activeAgent?.description,
        agentInstructions: activeAgent
          ? agentConfigs[activeAgent.id]?.instructions
          : undefined,
        agentSoul: activeAgent
          ? agentConfigs[activeAgent.id]?.soul
          : undefined,
        agentMemory: activeAgent
          ? agentConfigs[activeAgent.id]?.memory
          : undefined,
        // Only this role's ready documents — knowledge never crosses roles.
        agentKnowledge: knowledgeFiles
          .filter((f) => f.status === "ready")
          .map((f) => f.name),
        agentId: activeAgent?.id,
        sessionId: activeSessionId ?? undefined,
        skillName: activeSkill?.name,
        skillInstructions: activeSkill?.instructions,
      })) {
        rawReplyText += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: visibleAssistantText(rawReplyText) }
              : m,
          ),
        );
      }
      // Self-improve: the active role reflects on the exchange and saves any
      // durable facts to its OWN memory (isolated per role). Fire-and-forget.
      const replyText = visibleAssistantText(rawReplyText);
      if (selfImprove && activeAgent && replyText) {
        void reflectAndLearn(
          { user: content, assistant: replyText },
          "openrouter",
          routerConfig,
          agentConfigs[activeAgent.id]?.memory ?? [],
        ).then((notes) => addAgentMemory(activeAgent.id, notes));
      }
    } catch (error) {
      const note = `⚠️ ${error instanceof Error ? error.message : String(error)}`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content ? `${m.content}\n\n${note}` : note }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header: agent context + model catalog supplied by AI Router. */}
      <header className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {activeAgent ? `${activeAgent.emoji} ${activeAgent.name}` : "Chat"}
          </span>
          <ChatSessionMenu
            sessions={chatSessions}
            activeSessionId={activeSessionId}
            disabled={streaming}
            onCreate={createChatSession}
            onSwitch={switchChatSession}
            onRename={renameChatSession}
            onDelete={deleteChatSession}
          />
          {installedAgentList.length > 0 && (
            <select
              className="cursor-pointer rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none"
              value={activeAgentId ?? ""}
              onChange={(e) => setActiveAgent(e.target.value || null)}
            >
              <option value="">General assistant</option>
              {installedAgentList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {activeSkill && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold-400/15 px-2.5 py-0.5 text-xs font-medium text-gold-300">
              <Wand2 className="size-3" />
              {activeSkill.name}
              <button
                onClick={clearActiveSkill}
                className="cursor-pointer rounded-full hover:text-gold-100"
                title="Stop using this skill"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {routerModels.length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  setModelPickerOpen((o) => !o);
                }}
                className="flex max-w-[10rem] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800"
                title={activeModel}
              >
                <span className="truncate">{modelLabel}</span>
                <ChevronDown className="size-3.5 shrink-0" />
              </button>
              {modelPickerOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-1 shadow-xl">
                  <div className="flex items-center justify-between px-3 pb-1 pt-2">
                    <span className="text-[10px] font-semibold uppercase text-gold-300">Packs</span>
                    <button
                      onClick={() => openPackEditor()}
                      title="Add pack"
                      className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-gold-300"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  {packOptions.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setActiveModel(m.id);
                        setModelPickerOpen(false);
                      }}
                      className={cn(
                        "block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-800",
                        activeModel === m.id ? "text-gold-300" : "text-neutral-300",
                      )}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <Layers3 className="size-3.5" />
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          title="Edit pack"
                          onClick={(event) => { event.stopPropagation(); openPackEditor(m); }}
                          className="rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
                        ><Pencil className="size-3" /></span>
                        <span
                          role="button"
                          tabIndex={0}
                          title="Delete pack"
                          onClick={(event) => { event.stopPropagation(); void removePack(m); }}
                          className="rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-red-400"
                        ><Trash2 className="size-3" /></span>
                      </span>
                      <span className="block font-mono text-[10px] text-neutral-500">
                        {m.models?.length || 0} models · {m.strategy || "fallback"}
                      </span>
                    </button>
                  ))}
                  {packEditorOpen && (
                    <PortalWhen enabled={packExpanded}>
                      <div
                        className={cn(
                          packExpanded
                            ? "fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                            : "m-1",
                        )}
                        onClick={() => {
                          if (packExpanded) setPackExpanded(false);
                        }}
                      >
                      <div
                        className={cn(
                          "border border-neutral-700 bg-neutral-950 shadow-2xl",
                          packExpanded
                            ? "flex h-[min(48rem,calc(100vh-2rem))] w-[min(72rem,calc(100vw-2rem))] flex-col p-4"
                            : "p-3",
                        )}
                        onClick={(event) => event.stopPropagation()}
                      >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium">{editingPackId ? "Edit pack" : "New pack"}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPackExpanded((expanded) => !expanded)}
                            title={packExpanded ? "Collapse pack editor" : "Expand pack editor"}
                            className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                          >
                            {packExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                          </button>
                          <button onClick={() => setPackEditorOpen(false)} className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-800"><X className="size-3.5" /></button>
                        </div>
                      </div>
                      <input
                        value={packName}
                        onChange={(event) => setPackName(event.target.value)}
                        placeholder="Pack name"
                        className="mt-2 w-full border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-gold-400/60"
                      />
                      <div className="mt-2 grid grid-cols-2 border border-neutral-700 bg-neutral-900 p-1" role="radiogroup" aria-label="Pack routing strategy">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={packStrategy === "fallback"}
                          onClick={() => setPackStrategy("fallback")}
                          className={cn(
                            "cursor-pointer px-3 py-2 text-left text-xs transition-colors",
                            packStrategy === "fallback" ? "bg-gold-400 text-neutral-950" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
                          )}
                        >
                          Fallback
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={packStrategy === "round-robin"}
                          onClick={() => setPackStrategy("round-robin")}
                          className={cn(
                            "cursor-pointer px-3 py-2 text-left text-xs transition-colors",
                            packStrategy === "round-robin" ? "bg-gold-400 text-neutral-950" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
                          )}
                        >
                          Round robin
                        </button>
                      </div>
                      {packExpanded && <details className="relative mt-2">
                        <summary className="flex cursor-pointer list-none items-center justify-between border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 hover:border-neutral-600">
                          <span>Accounts</span>
                          <span className="text-neutral-500">
                            {packAccountFilters.length}/{connectedModelAccounts.length} selected
                          </span>
                        </summary>
                        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full overflow-y-auto border border-neutral-700 bg-neutral-900 p-2 shadow-2xl sm:w-[28rem]">
                          <div className="mb-2 flex items-center justify-between gap-3 border-b border-neutral-800 pb-2">
                            <span className="text-[10px] font-semibold uppercase text-neutral-500">Connected accounts</span>
                            <button
                              onClick={() => setPackAccountFilters(
                                packAccountFilters.length === connectedModelAccounts.length
                                  ? []
                                  : connectedModelAccounts.map((account) => account.id),
                              )}
                              className="cursor-pointer text-[10px] text-gold-300 hover:text-gold-200"
                            >
                              {packAccountFilters.length === connectedModelAccounts.length ? "Clear all" : "Select all"}
                            </button>
                          </div>
                          <div className="flex flex-col gap-1">
                            {connectedModelAccounts.map((account) => (
                              <label key={account.id} className="flex cursor-pointer items-center gap-2 px-1 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">
                                <input
                                  type="checkbox"
                                  checked={packAccountFilters.includes(account.id)}
                                  onChange={() => setPackAccountFilters((current) => current.includes(account.id)
                                    ? current.filter((id) => id !== account.id)
                                    : [...current, account.id])}
                                  className="accent-gold-400"
                                />
                                <span className="min-w-0 flex-1 truncate">{account.provider} · {account.label}</span>
                                <span className="text-[10px] text-neutral-600">{account.count}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </details>}
                      <div className={cn(
                        "mt-2 overflow-y-auto border border-neutral-800",
                        packExpanded ? "grid min-h-0 flex-1 grid-cols-1 content-start sm:grid-cols-2" : "max-h-48",
                      )}>
                        {filteredPackModels.map((model) => (
                          <label key={model.id} className="flex cursor-pointer items-center gap-2 border-b border-neutral-800 px-2 py-1.5 text-xs last:border-0 hover:bg-neutral-900">
                            <input
                              type="checkbox"
                              checked={packModels.includes(model.id)}
                              onChange={() => setPackModels((current) => current.includes(model.id)
                                ? current.filter((id) => id !== model.id)
                                : [...current, model.id])}
                              className="accent-gold-400"
                            />
                            <span className="min-w-0 flex-1 truncate">{model.name}</span>
                            <span className="max-w-[45%] truncate text-[10px] text-neutral-500" title={model.accountLabel}>
                              {model.provider} · {model.accountLabel || "Account"}
                            </span>
                          </label>
                        ))}
                      </div>
                      <button
                        onClick={() => void savePack()}
                        disabled={!packName.trim() || packModels.length < 2}
                        className="mt-2 w-full cursor-pointer bg-gold-400 px-2 py-1.5 text-xs font-medium text-neutral-950 disabled:cursor-default disabled:opacity-40"
                      >
                        {editingPackId ? "Save pack" : "Create pack"}
                      </button>
                      {packError && <p className="mt-1 text-[10px] text-red-300">{packError}</p>}
                      </div>
                      </div>
                    </PortalWhen>
                  )}
                  <details className="mt-1 border-t border-neutral-800">
                    <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase text-neutral-500 hover:text-neutral-300">
                      Individual models ({individualModels.length})
                    </summary>
                    {individualModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setActiveModel(m.id);
                          setModelPickerOpen(false);
                        }}
                        className={cn(
                          "block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-800",
                          activeModel === m.id ? "text-gold-300" : "text-neutral-300",
                        )}
                      >
                        {m.name}
                        <span className="block truncate text-[10px] text-neutral-500" title={m.accountLabel}>
                          {m.provider} · {m.accountLabel || "Account"}
                        </span>
                      </button>
                    ))}
                  </details>
                </div>
              )}
            </div>
          )}
          {modelLoadError && (
            <span className="max-w-[14rem] truncate px-2 text-xs text-amber-300" title={modelLoadError}>
              AI Router unavailable
            </span>
          )}
          <button
            onClick={clearChat}
            title="Clear conversation"
            className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          >
            <Eraser className="size-4" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" data-selectable>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Logo className="size-14 opacity-95" />
            <h2 className="mt-4 text-lg font-semibold">
              How can I help you today?
            </h2>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Write an email, summarize a document, build a plan — or pick an
              installed agent above for specialist help.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-gold-400 text-neutral-950"
                      : "bg-neutral-800/80 text-neutral-100",
                  )}
                >
                  {m.content ? (
                    <MessageContent content={m.content} assistant={m.role === "assistant"} />
                  ) :
                    (streaming && (
                      <span className="inline-block animate-pulse">…</span>
                    ))}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-neutral-800 px-3 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 p-2 focus-within:border-gold-400/60">
          <textarea
            ref={composerRef}
            rows={1}
            value={input}
            placeholder={
              activeAgent
                ? `Ask your ${activeAgent.name}…`
                : "Message V Assistant…"
            }
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-neutral-500"
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || streaming || !activeModel}
            className="cursor-pointer rounded-xl bg-gold-400 p-2 text-neutral-950 transition-colors hover:bg-gold-300 disabled:pointer-events-none disabled:opacity-40"
          >
            <SendHorizonal className="size-4" />
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-neutral-600">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}
