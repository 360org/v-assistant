import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eraser, SendHorizonal, Wand2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import {
  type ProviderConfig,
} from "@/runtime/providers";
import { createEngine, newMessageId, type ChatMessage } from "@/runtime/engine";
import { reflectAndLearn } from "@/runtime/selfImprove";
import { AI_ROUTER_BASE_URL, getAiRouterModels, type AiRouterModel } from "@/runtime/aiRouter";
import { Logo } from "@/components/Logo";
import { ChatSessionMenu } from "@/components/ChatSessionMenu";
import { cn } from "@/lib/utils";

const engine = createEngine();

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
  const modelLabel = routerModels.find((m) => m.id === activeModel)?.name || activeModel;
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
    let replyText = "";
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
        replyText += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m,
          ),
        );
      }
      // Self-improve: the active role reflects on the exchange and saves any
      // durable facts to its OWN memory (isolated per role). Fire-and-forget.
      if (selfImprove && activeAgent && replyText.trim()) {
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
                <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-xl border border-neutral-800 bg-neutral-900 p-1 shadow-xl">
                  {routerModels.map((m) => (
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
                      <span className="block font-mono text-[10px] text-neutral-500">
                        {m.provider ? `${m.provider} · ${m.id}` : m.id}
                      </span>
                    </button>
                  ))}
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
                  {m.content ||
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
