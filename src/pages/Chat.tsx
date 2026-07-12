import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eraser, SendHorizonal, Wand2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import {
  AGENT_STORE,
  PROVIDERS,
  getProvider,
  type ProviderId,
} from "@/lib/catalog";
import { createEngine, newMessageId, type ChatMessage } from "@/runtime/engine";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const engine = createEngine();

export function Chat() {
  const {
    messages,
    setMessages,
    clearChat,
    provider,
    setProvider,
    installedAgents,
    activeAgentId,
    setActiveAgent,
    chatDraft,
    consumeChatDraft,
    providerConfigs,
    activeSkill,
    clearActiveSkill,
    agentConfigs,
    knowledgeFiles,
  } = useApp();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const activeAgent = useMemo(
    () => AGENT_STORE.find((a) => a.id === activeAgentId) ?? null,
    [activeAgentId],
  );
  const installedAgentList = useMemo(
    () => AGENT_STORE.filter((a) => installedAgents.includes(a.id)),
    [installedAgents],
  );

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
    if (!content || streaming || !provider) return;
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
    try {
      for await (const chunk of engine.chat(history, {
        provider,
        config: providerConfigs[provider],
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
        skillName: activeSkill?.name,
        skillInstructions: activeSkill?.instructions,
      })) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m,
          ),
        );
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
      {/* Header: agent context + one-click provider switch */}
      <header className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {activeAgent ? `${activeAgent.emoji} ${activeAgent.name}` : "Chat"}
          </span>
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
          <div className="relative">
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              {provider ? getProvider(provider).name : "Provider"}
              <ChevronDown className="size-3.5" />
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-neutral-800 bg-neutral-900 p-1 shadow-xl">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setProvider(p.id as ProviderId);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs hover:bg-neutral-800",
                      provider === p.id
                        ? "text-gold-300"
                        : "text-neutral-300",
                    )}
                  >
                    {p.name}
                    <span className="block text-[10px] text-neutral-500">
                      {p.tagline}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
            disabled={!input.trim() || streaming}
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
