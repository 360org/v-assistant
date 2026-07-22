import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Eraser, ExternalLink, FileCode, FileText, FolderOpen, Globe, Image, Layers3, Link2, Loader2, Maximize2, Minimize2, Paperclip, Pencil, Plus, Search, SendHorizonal, Trash2, Wand2, X } from "lucide-react";
import { useApp, fileObjectURLs } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { getKnowledgeFileRecord } from "@/runtime/knowledge";
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
import { MessageContent, openExternalUrl, visibleAssistantText } from "@/components/MessageContent";
import { cn } from "@/lib/utils";

const engine = createEngine();

function PortalWhen({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? createPortal(children, document.body) : <>{children}</>;
}

function InlineAttachmentPreview({
  att,
  onOpenPreview,
}: {
  att: { id: string; name: string };
  onOpenPreview: () => void;
}) {
  const ext = att.name.toLowerCase().split(".").pop() ?? "";
  const isImg = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
  const [imgSrc, setImgSrc] = useState<string | null>(fileObjectURLs.get(att.id) || null);

  useEffect(() => {
    if (!isImg || imgSrc) return;
    let cancelled = false;

    void getKnowledgeFileRecord(att.id).then((rec) => {
      if (cancelled) return;
      if (rec?.dataUrl) {
        setImgSrc(rec.dataUrl);
      } else if (rec?.chunks?.[0]?.startsWith("data:image/")) {
        setImgSrc(rec.chunks[0]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [att.id, isImg, imgSrc]);

  if (isImg) {
    return (
      <div
        onClick={onOpenPreview}
        className="group relative overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-950 cursor-pointer transition-all hover:border-gold-400 max-w-[280px] max-h-[220px] shadow-md"
        title={`Xem ảnh phóng to: ${att.name}`}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={att.name}
            className="max-h-[220px] w-full object-cover rounded-xl transition-transform duration-200 group-hover:scale-105 select-none"
          />
        ) : (
          <div className="flex items-center gap-2 p-3 text-xs text-gold-300">
            <Image className="size-4 shrink-0 animate-pulse text-gold-400" />
            <span className="truncate max-w-[180px]">{att.name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
          <span className="text-[10px] text-white truncate font-medium">{att.name}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onOpenPreview}
      className="flex items-center gap-2 rounded-xl border border-gold-500/40 bg-gold-400/10 px-3 py-1.5 text-xs font-medium text-gold-300 hover:bg-gold-400/20 hover:border-gold-400 transition-all cursor-pointer shadow-xs"
      title={`Bấm để xem trước: ${att.name}`}
    >
      <Paperclip className="size-3.5 text-gold-400 shrink-0" />
      <span className="max-w-[180px] truncate">{att.name}</span>
    </button>
  );
}

export function Chat() {
  const [sentFileIds, setSentFileIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [mediaTab, setMediaTab] = useState<"media" | "link" | "docs">("media");

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
    addKnowledgeFiles,
    removeKnowledgeFile,
    selfImprove,
    addAgentMemory,
    agents,
  } = useApp();
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
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
  const agentPickerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!agentPickerOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!agentPickerRef.current?.contains(event.target as Node)) {
        setAgentPickerOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [agentPickerOpen]);

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

  const sharedMediaItems = useMemo(() => {
    const mediaList: { id: string; name: string; date: string; dataUrl?: string }[] = [];
    const linkList: { url: string; date: string }[] = [];
    const docList: { id: string; name: string; date: string }[] = [];

    const imgExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "heic", "heif"];
    const urlRegex = /(https?:\/\/[^\s<">]+)/g;

    messages.forEach((m) => {
      const dateStr = new Date(m.createdAt).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const matches = m.content.match(urlRegex);
      if (matches) {
        matches.forEach((u) => {
          if (!linkList.some((l) => l.url === u)) {
            linkList.push({ url: u, date: dateStr });
          }
        });
      }

      if (m.attachments) {
        m.attachments.forEach((att) => {
          const ext = att.name.toLowerCase().split(".").pop() ?? "";
          if (imgExtensions.includes(ext)) {
            if (!mediaList.some((item) => item.id === att.id)) {
              mediaList.push({
                id: att.id,
                name: att.name,
                date: dateStr,
                dataUrl: fileObjectURLs.get(att.id),
              });
            }
          } else {
            if (!docList.some((item) => item.id === att.id)) {
              docList.push({ id: att.id, name: att.name, date: dateStr });
            }
          }
        });
      }
    });

    knowledgeFiles.forEach((f) => {
      if (f.status === "ready") {
        const ext = f.name.toLowerCase().split(".").pop() ?? "";
        const dateStr = new Date().toLocaleDateString("vi-VN");
        if (imgExtensions.includes(ext)) {
          if (!mediaList.some((item) => item.id === f.id)) {
            mediaList.push({
              id: f.id,
              name: f.name,
              date: dateStr,
              dataUrl: fileObjectURLs.get(f.id),
            });
          }
        } else {
          if (!docList.some((item) => item.id === f.id)) {
            docList.push({ id: f.id, name: f.name, date: dateStr });
          }
        }
      }
    });

    return { media: mediaList, links: linkList, docs: docList };
  }, [messages, knowledgeFiles]);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.attachments?.some((att) => att.name.toLowerCase().includes(q))
    );
  }, [messages, searchQuery]);

  const send = async () => {
    const readyFiles = knowledgeFiles.filter((f) => !sentFileIds.has(f.id) && f.status === "ready");
    const textContent = input.trim();
    if ((!textContent && readyFiles.length === 0) || streaming || !activeModel) return;

    let content = textContent;
    if (readyFiles.length > 0) {
      const fileNames = readyFiles.map((f) => f.name).join(", ");
      content = textContent
        ? `${textContent}\n\n📎 Đã gửi tệp: ${fileNames}`
        : `📎 Đã gửi tệp: ${fileNames}`;
    }

    setInput("");

    if (readyFiles.length > 0) {
      setSentFileIds((prev) => new Set([...prev, ...readyFiles.map((f) => f.id)]));
      readyFiles.forEach((f) => removeKnowledgeFile(f.id));
    }

    const userMessage: ChatMessage = {
      id: newMessageId(),
      role: "user",
      content,
      createdAt: Date.now(),
      attachments: readyFiles.map((f) => ({ id: f.id, name: f.name })),
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
            <div ref={agentPickerRef} className="relative shrink-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={agentPickerOpen}
                onClick={() => setAgentPickerOpen((open) => !open)}
                className="flex h-8 max-w-44 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 text-xs text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70"
                title="Switch assistant role"
              >
                <span className="truncate">{activeAgent ? activeAgent.name : "General assistant"}</span>
                <ChevronDown className={`size-3.5 shrink-0 text-neutral-400 transition-transform ${agentPickerOpen ? "rotate-180" : ""}`} />
              </button>
              {agentPickerOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-10 z-50 w-72 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-2xl shadow-black/50"
                >
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setActiveAgent(null);
                      setAgentPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-900"
                  >
                    <span className="flex size-7 items-center justify-center rounded-md bg-neutral-800 text-xs">AI</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">General assistant</span>
                      <span className="block truncate text-xs text-neutral-500">No specialized role</span>
                    </span>
                    {!activeAgent && <Check className="size-4 text-gold-300" />}
                  </button>
                  <div className="my-1 border-t border-neutral-800" />
                  {installedAgentList.map((agent) => {
                    const selected = agent.id === activeAgentId;
                    return (
                      <button
                        key={agent.id}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setActiveAgent(agent.id);
                          setAgentPickerOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-neutral-900 ${selected ? "bg-gold-400/10" : ""}`}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-base">{agent.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-medium ${selected ? "text-gold-200" : "text-neutral-200"}`}>{agent.name}</span>
                          <span className="block truncate text-xs text-neutral-500">{agent.description}</span>
                        </span>
                        {selected && <Check className="size-4 shrink-0 text-gold-300" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
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
            onClick={() => setShowSearch((prev) => !prev)}
            title="Search chat history"
            className={cn(
              "cursor-pointer rounded-lg p-1.5 transition-colors",
              showSearch ? "bg-gold-400/20 text-gold-300" : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
            )}
          >
            <Search className="size-4" />
          </button>
          <button
            onClick={() => setShowSharedMedia((prev) => !prev)}
            title="Shared Media & Files"
            className={cn(
              "cursor-pointer rounded-lg p-1.5 transition-colors",
              showSharedMedia ? "bg-gold-400/20 text-gold-300" : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
            )}
          >
            <FolderOpen className="size-4" />
          </button>
          <button
            onClick={clearChat}
            title="Clear conversation"
            className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          >
            <Eraser className="size-4" />
          </button>
        </div>
      </header>

      {/* Search Bar */}
      {showSearch && (
        <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900/90 px-4 py-2 text-xs">
          <Search className="size-3.5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm nội dung đã chat..."
            className="flex-1 bg-transparent outline-none text-neutral-200 placeholder:text-neutral-500"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-neutral-500 hover:text-neutral-300 cursor-pointer">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Main Body Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" data-selectable>
          {filteredMessages.length === 0 ? (
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
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {filteredMessages.map((m) => {
              const isUser = m.role === "user";
              const formattedTime = new Date(m.createdAt).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-start",
                    isUser ? "justify-end" : "justify-start",
                  )}
                >
                  {!isUser && (
                    <div
                      className="size-7 rounded-full bg-neutral-850 border border-neutral-800 flex items-center justify-center text-sm shrink-0 mr-2.5 mt-0.5 shadow-md select-none"
                      title={activeAgent?.name || "V Assistant"}
                    >
                      {activeAgent?.emoji || "🤖"}
                    </div>
                  )}
                  <div className="flex flex-col max-w-[85%]">
                    <div
                      className={cn(
                        "whitespace-pre-wrap px-4 py-2.5 text-sm leading-relaxed shadow-md transition-all duration-200",
                        isUser
                          ? "bg-gold-500/10 border border-gold-500/25 text-neutral-100 rounded-2xl rounded-tr-xs"
                          : "bg-neutral-850 border border-neutral-800/80 text-neutral-100 rounded-2xl rounded-tl-xs",
                      )}
                    >
                      {/* Inline Image & File Previews (WhatsApp / Telegram style) */}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2.5">
                          {m.attachments.map((att) => (
                            <InlineAttachmentPreview
                              key={att.id}
                              att={att}
                              onOpenPreview={() => setPreviewFile({ id: att.id, name: att.name })}
                            />
                          ))}
                        </div>
                      )}

                      {m.content ? (
                        <MessageContent
                          content={m.content.replace(/(\n\n)?📎 Đã gửi tệp:.*$/g, "").trim() || (m.attachments?.length ? "" : m.content)}
                          assistant={m.role === "assistant"}
                        />
                      ) : (
                        streaming && (
                          <div className="flex items-center gap-1 py-1">
                            <span className="size-1.5 rounded-full bg-gold-400/80 animate-bounce [animation-delay:-0.3s]" />
                            <span className="size-1.5 rounded-full bg-gold-400/80 animate-bounce [animation-delay:-0.15s]" />
                            <span className="size-1.5 rounded-full bg-gold-400/80 animate-bounce" />
                          </div>
                        )
                      )}
                      
                      {/* Meta/Timestamp footer inside the bubble */}
                      <div className="mt-1 flex items-center justify-end gap-1 select-none">
                        <span className={cn(
                          "text-[9px] font-normal leading-none",
                          isUser ? "text-gold-400/50" : "text-neutral-500"
                        )}>
                          {formattedTime}
                        </span>
                        {isUser && (
                          <span className="text-[10px] text-gold-400/70 font-bold leading-none select-none">✓✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Shared Media Side Panel (Telegram / WhatsApp Style Drawer) */}
      {showSharedMedia && (
        <div className="w-80 border-l border-neutral-800 bg-neutral-900/95 flex flex-col shrink-0 animate-fadeIn transition-all">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-800 shrink-0">
            <div>
              <h3 className="font-semibold text-neutral-200 text-sm">Files & Media</h3>
              <p className="text-[10px] text-neutral-400 mt-0.5">Media, liên kết và tài liệu đã chia sẻ</p>
            </div>
            <button
              onClick={() => setShowSharedMedia(false)}
              className="cursor-pointer rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
              title="Đóng"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-neutral-800 p-1.5 gap-1 bg-neutral-950/40 shrink-0">
            <button
              onClick={() => setMediaTab("media")}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
                mediaTab === "media"
                  ? "bg-gold-400/20 text-gold-300 border border-gold-400/30"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
              )}
            >
              Media ({sharedMediaItems.media.length})
            </button>
            <button
              onClick={() => setMediaTab("link")}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
                mediaTab === "link"
                  ? "bg-gold-400/20 text-gold-300 border border-gold-400/30"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
              )}
            >
              Link ({sharedMediaItems.links.length})
            </button>
            <button
              onClick={() => setMediaTab("docs")}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
                mediaTab === "docs"
                  ? "bg-gold-400/20 text-gold-300 border border-gold-400/30"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850"
              )}
            >
              Docs ({sharedMediaItems.docs.length})
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {mediaTab === "media" && (
              sharedMediaItems.media.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs">
                  <Image className="size-8 mb-2 opacity-40" />
                  Chưa có hình ảnh nào được chia sẻ
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {sharedMediaItems.media.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setPreviewFile({ id: item.id, name: item.name })}
                      className="group relative aspect-square rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden cursor-pointer hover:border-gold-400 transition-all shadow-xs"
                      title={item.name}
                    >
                      {item.dataUrl ? (
                        <img src={item.dataUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 select-none" />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full bg-neutral-850 text-neutral-400">
                          <FileText className="size-5" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
                        <span className="text-[9px] text-neutral-200 truncate w-full">{item.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {mediaTab === "link" && (
              sharedMediaItems.links.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs">
                  <Globe className="size-8 mb-2 opacity-40" />
                  Chưa có liên kết URL nào
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sharedMediaItems.links.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        void openExternalUrl(link.url);
                      }}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-850 hover:border-gold-400/50 transition-all text-xs group cursor-pointer"
                    >
                      <Link2 className="size-4 text-gold-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-neutral-200 truncate group-hover:text-gold-300">{link.url}</p>
                        <span className="text-[10px] text-neutral-500 mt-0.5 block">{link.date}</span>
                      </div>
                      <ExternalLink className="size-3 text-neutral-500 shrink-0 mt-0.5 group-hover:text-gold-400" />
                    </a>
                  ))}
                </div>
              )
            )}

            {mediaTab === "docs" && (
              sharedMediaItems.docs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs">
                  <FileCode className="size-8 mb-2 opacity-40" />
                  Chưa có tài liệu nào
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sharedMediaItems.docs.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setPreviewFile({ id: doc.id, name: doc.name })}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-850 hover:border-gold-400/50 transition-all text-xs cursor-pointer group"
                    >
                      <FileText className="size-4 text-gold-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-neutral-200 truncate group-hover:text-gold-300">{doc.name}</p>
                        <span className="text-[10px] text-neutral-500 mt-0.5 block">{doc.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
      </div>

      {/* Composer */}
      <div className="border-t border-neutral-800 px-3 py-3 sm:px-6 sm:py-4">
        {/* Attachment files list */}
        {knowledgeFiles.filter((f) => !sentFileIds.has(f.id)).length > 0 && (
          <div className="mx-auto mb-2 flex max-w-2xl flex-wrap gap-2 px-1">
            {knowledgeFiles.filter((f) => !sentFileIds.has(f.id)).map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs"
              >
                <FileText className="size-3.5 text-neutral-500" />
                <span
                  onClick={() => {
                    if (f.status === "ready") {
                      setPreviewFile({ id: f.id, name: f.name });
                    }
                  }}
                  className={cn(
                    "max-w-[120px] truncate",
                    f.status === "ready" ? "cursor-pointer hover:underline hover:text-gold-300" : ""
                  )}
                  title={f.name}
                >
                  {f.name}
                </span>
                {f.status === "processing" ? (
                  <Loader2 className="size-3 animate-spin text-gold-300" />
                ) : f.status === "error" ? (
                  <span className="text-[10px] text-red-400" title={f.error}>Failed</span>
                ) : (
                  <span className="text-[10px] text-green-400">Ready</span>
                )}
                <button
                  onClick={() => removeKnowledgeFile(f.id)}
                  className="ml-1 cursor-pointer rounded-full p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                  title="Remove file"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 p-2 focus-within:border-gold-400/60">
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) addKnowledgeFiles(files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach files (PDF, Word, Excel, Text...)"
            className="cursor-pointer rounded-xl p-2 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
          >
            <Paperclip className="size-4" />
          </button>

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
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files ?? []);
              if (files.length > 0) {
                addKnowledgeFiles(files);
              }
            }}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-neutral-500"
          />
          <button
            onClick={() => void send()}
            disabled={(!input.trim() && knowledgeFiles.filter((f) => !sentFileIds.has(f.id) && f.status === "ready").length === 0) || streaming || !activeModel}
            className="cursor-pointer rounded-xl bg-gold-400 p-2 text-neutral-950 transition-colors hover:bg-gold-300 disabled:pointer-events-none disabled:opacity-40"
          >
            <SendHorizonal className="size-4" />
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-neutral-600">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>

      {previewFile && (
        <FilePreviewModal
          fileId={previewFile.id}
          fileName={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

function FilePreviewModal({
  fileId,
  fileName,
  onClose,
}: {
  fileId: string;
  fileName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(fileObjectURLs.get(fileId) ?? null);

  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "heic", "heif"].includes(ext);

  useEffect(() => {
    getKnowledgeFileRecord(fileId)
      .then((rec) => {
        if (rec) {
          if (rec.dataUrl) {
            setImageSrc(rec.dataUrl);
          }
          if (rec.chunks && rec.chunks.length > 0) {
            setContent(rec.chunks.join("\n\n"));
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load preview record:", e);
        setLoading(false);
      });
  }, [fileId]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-neutral-800 bg-neutral-900 p-5 flex flex-col max-h-[90vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 border-b border-neutral-800 pb-3">
          <div className="min-w-0 flex-1 pr-4">
            <h3 className="font-semibold text-neutral-200 truncate text-base">{fileName}</h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">Xem trước tài liệu tri thức của Agent</p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-auto bg-neutral-950 rounded-xl border border-neutral-800/80 p-4 flex items-center justify-center min-h-[350px]">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-neutral-400">
              <Loader2 className="size-7 animate-spin text-gold-300" />
              <span className="text-xs">Đang tải nội dung xem trước...</span>
            </div>
          ) : isImage ? (
            imageSrc ? (
              <div className="flex items-center justify-center w-full h-full p-2">
                <img
                  src={imageSrc}
                  alt={fileName}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg select-none"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-center p-6 bg-neutral-900/60 rounded-xl border border-neutral-800 max-w-md">
                <div className="size-16 rounded-2xl bg-gold-400/10 border border-gold-400/30 flex items-center justify-center text-gold-300">
                  <FileText className="size-8" />
                </div>
                <div>
                  <h4 className="font-medium text-neutral-200 text-sm truncate max-w-xs">{fileName}</h4>
                  <p className="text-xs text-neutral-400 mt-1">Tệp hình ảnh tri thức đã được trích xuất cho Agent</p>
                </div>
                <div className="text-[11px] text-neutral-400 font-mono bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-850 w-full text-left whitespace-pre-wrap">
                  {content || `[Tệp hình ảnh: ${fileName} | Định dạng: ${ext.toUpperCase()}]`}
                </div>
              </div>
            )
          ) : (
            <div className="w-full h-full text-left font-mono text-xs text-neutral-300 whitespace-pre-wrap select-text leading-relaxed p-2">
              {content || "Không có nội dung văn bản nào được trích xuất từ tệp này."}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2 shrink-0">
          <Button size="sm" onClick={onClose} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
