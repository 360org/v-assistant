import { useEffect, useRef, useState } from "react";
import { Check, History, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import type { ChatSession } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ChatSessionMenuProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  disabled?: boolean;
  onCreate: () => void;
  onSwitch: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onDelete: (sessionId: string) => void;
}

export function ChatSessionMenu({
  sessions,
  activeSessionId,
  disabled,
  onCreate,
  onSwitch,
  onRename,
  onDelete,
}: ChatSessionMenuProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const startRename = (session: ChatSession) => {
    setEditingId(session.id);
    setDraft(session.title);
  };

  const finishRename = () => {
    if (editingId && draft.trim()) onRename(editingId, draft);
    setEditingId(null);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Manage chat sessions"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <History className="size-3.5" />
        <span className="hidden sm:inline">Sessions</span>
      </button>

      {open && (
        <section
          aria-label="Chat sessions"
          className="absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2.5">
            <h2 className="text-xs font-semibold text-neutral-200">Chat sessions</h2>
            <button
              type="button"
              onClick={() => {
                onCreate();
                setOpen(false);
              }}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-gold-300 hover:bg-neutral-800"
            >
              <MessageSquarePlus className="size-3.5" />
              New
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5" role="list">
            {sessions.map((session) => (
              <div
                key={session.id}
                role="listitem"
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-2 py-1.5",
                  session.id === activeSessionId ? "bg-neutral-800" : "hover:bg-neutral-900",
                )}
              >
                {editingId === session.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      finishRename();
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Session name"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-gold-400"
                    />
                    <button type="submit" aria-label="Save session name" className="rounded p-1 text-gold-300 hover:bg-neutral-700">
                      <Check className="size-3.5" />
                    </button>
                    <button type="button" aria-label="Cancel rename" onClick={() => setEditingId(null)} className="rounded p-1 text-neutral-400 hover:bg-neutral-700">
                      <X className="size-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onSwitch(session.id);
                        setOpen(false);
                      }}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <span className="flex items-center gap-1.5 truncate text-xs text-neutral-200">
                        {session.channel === "telegram" && (
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-300">
                            Telegram
                          </span>
                        )}
                        <span className="truncate">{session.title}</span>
                      </span>
                      <span className="block text-[10px] text-neutral-500">
                        {session.messages.length} messages · {new Date(session.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button type="button" aria-label={`Rename ${session.title}`} onClick={() => startRename(session)} className="rounded p-1 text-neutral-500 opacity-0 hover:bg-neutral-700 hover:text-neutral-200 group-hover:opacity-100 focus:opacity-100">
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" aria-label={`Delete ${session.title}`} onClick={() => onDelete(session.id)} className="rounded p-1 text-neutral-500 opacity-0 hover:bg-red-950 hover:text-red-300 group-hover:opacity-100 focus:opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
