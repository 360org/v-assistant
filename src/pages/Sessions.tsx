import { useMemo, useState } from "react";
import { History, MessageSquarePlus, Search, Send, Trash2, Pencil, Check, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type ChannelFilter = "all" | "desktop" | "telegram";

export function Sessions() {
  const {
    chatSessions,
    activeSessionId,
    createChatSession,
    switchChatSession,
    renameChatSession,
    deleteChatSession,
    setView,
  } = useApp();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");


  const sessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...chatSessions]
      .filter((session) => channel === "all" || session.channel === channel)
      .filter((session) => !needle || session.title.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [chatSessions, channel, query]);

  const openSession = (sessionId: string) => {
    switchChatSession(sessionId);
    setView("chat");
  };

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-col gap-4 border-b border-neutral-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-gold-300">
            <History className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Conversation history</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-100">All sessions</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Desktop and connected channel conversations in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            createChatSession();
            setView("chat");
          }}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-gold-400 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-gold-300"
        >
          <MessageSquarePlus className="size-4" />
          New chat
        </button>
      </header>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search sessions</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-neutral-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-gold-400"
          />
        </label>
        <div className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-1" aria-label="Filter sessions by channel">
          {(["all", "desktop", "telegram"] as ChannelFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setChannel(item)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 text-xs capitalize",
                channel === item ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center" role="status">
          <History className="size-9 text-neutral-700" />
          <h2 className="mt-3 text-sm font-medium text-neutral-300">No sessions found</h2>
          <p className="mt-1 text-xs text-neutral-600">Try another filter or start a new conversation.</p>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
          {sessions.map((session) => (
            <article key={session.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-neutral-900">
              <span className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                session.channel === "telegram" ? "bg-sky-500/15 text-sky-300" : "bg-neutral-800 text-neutral-400",
              )}>
                {session.channel === "telegram" ? <Send className="size-4" /> : <History className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {editingSessionId === session.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          renameChatSession(session.id, editingTitle);
                          setEditingSessionId(null);
                        } else if (e.key === "Escape") {
                          setEditingSessionId(null);
                        }
                      }}
                      className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-sm font-medium text-neutral-200 outline-none focus:border-gold-400"
                    />
                  ) : (
                    <button type="button" onClick={() => openSession(session.id)} className="cursor-pointer truncate text-left text-sm font-medium text-neutral-200 hover:text-gold-300">
                      {session.title}
                    </button>
                  )}
                  {session.id === activeSessionId && <span className="text-[10px] text-gold-300">Active</span>}
                </div>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {session.channel === "telegram" ? "Telegram" : "Desktop"} · {session.messages.length} messages · {new Date(session.updatedAt).toLocaleString()}
                </span>
              </div>
              
              <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                {editingSessionId === session.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        renameChatSession(session.id, editingTitle);
                        setEditingSessionId(null);
                      }}
                      className="cursor-pointer rounded-lg p-2 text-green-500 hover:bg-green-950/30 hover:text-green-400"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSessionId(null)}
                      className="cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
                    >
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Edit ${session.title}`}
                      onClick={() => {
                        setEditingTitle(session.title);
                        setEditingSessionId(session.id);
                      }}
                      className="cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${session.title}`}
                      onClick={() => deleteChatSession(session.id)}
                      className="cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-red-950/30 hover:text-red-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
