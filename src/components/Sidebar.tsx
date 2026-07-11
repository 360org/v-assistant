import {
  Blocks,
  Bot,
  CalendarClock,
  Home,
  KeyRound,
  Library,
  MessageSquare,
  Settings,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type View } from "@/lib/store";
import { Logo } from "@/components/Logo";

const items: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "chat", label: "Chat", icon: MessageSquare },
  { view: "agents", label: "Agents", icon: Bot },
  { view: "skills", label: "Skills", icon: Wand2 },
  { view: "knowledge", label: "Knowledge", icon: Library },
  { view: "vault", label: "Vault", icon: KeyRound },
  { view: "scheduled", label: "Scheduled", icon: CalendarClock },
  { view: "integrations", label: "Integrations", icon: Blocks },
];

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called after picking a menu item (used to close the mobile drawer). */
  onNavigate?: () => void;
}) {
  const { view, setView, user } = useApp();
  const go = (v: View) => {
    setView(v);
    onNavigate?.();
  };

  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-2 py-3">
        <Logo />
        <div>
          <div className="text-sm font-semibold leading-tight">V Assistant</div>
          <div className="text-xs text-neutral-500">AI for everyone</div>
        </div>
      </div>

      <nav className="mt-2 flex flex-col gap-1">
        {items.map(({ view: v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => go(v)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
              view === v
                ? "bg-neutral-800 text-neutral-50"
                : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* User cluster: Settings lives here, grouped with the profile. */}
      <div className="mt-auto flex flex-col gap-1 px-2 pb-1">
        <button
          onClick={() => go("settings")}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
            view === "settings"
              ? "bg-neutral-800 text-neutral-50"
              : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200",
          )}
        >
          <Settings className="size-4" />
          Settings
        </button>

        <button
          onClick={() => go("settings")}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-left transition-colors hover:border-neutral-700"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-sm font-bold text-neutral-950">
            {(user?.name ?? "V").charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-neutral-200">
              {user?.name ?? "V Assistant"}
            </span>
            <span className="block truncate text-[11px] text-neutral-500">
              Powered by VuaAI.net
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
