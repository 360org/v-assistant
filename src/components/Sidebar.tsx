import {
  Blocks,
  Bot,
  CalendarClock,
  Home,
  Image as ImageIcon,
  KeyRound,
  Library,
  MessageSquare,
  History,
  Settings,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type View } from "@/lib/store";
import { Logo } from "@/components/Logo";
import { SidebarAdBanner } from "@/components/SidebarAdBanner";
import { t } from "@/lib/i18n";

const items: { view: View; key: Parameters<typeof t>[0]; icon: LucideIcon }[] = [
  { view: "home", key: "home", icon: Home },
  { view: "chat", key: "chat", icon: MessageSquare },
  { view: "sessions", key: "sessions", icon: History },
  { view: "agents", key: "agents", icon: Bot },
  { view: "skills", key: "skills", icon: Wand2 },
  { view: "knowledge", key: "knowledge", icon: Library },
  { view: "media", key: "media", icon: ImageIcon },
  { view: "vault", key: "vault", icon: KeyRound },
  { view: "scheduled", key: "scheduled", icon: CalendarClock },
  { view: "integrations", key: "integrations", icon: Blocks },
];

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called after picking a menu item (used to close the mobile drawer). */
  onNavigate?: () => void;
}) {
  const { view, setView, user, appUpdate, language } = useApp();
  const currentVersion = appUpdate?.currentVersion || (typeof __V_ASSISTANT_VERSION__ !== "undefined" ? __V_ASSISTANT_VERSION__ : "1.1.3");

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
          <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
            V Assistant
            <span className="rounded-md border border-emerald-500/30 bg-emerald-950/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
              v{currentVersion}
            </span>
          </div>
          <div className="text-xs text-neutral-500">AI for everyone</div>
        </div>
      </div>

      <nav className="mt-2 flex flex-col gap-1">
        {items.map(({ view: v, key, icon: Icon }) => (
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
            {t(key, language)}
          </button>
        ))}
      </nav>

      {/* Dynamic VuaAI.net Promotional Ad Banner */}
      <div className="mt-auto px-1 py-1.5">
        <SidebarAdBanner />
      </div>

      <div className="flex flex-col gap-1.5 px-2 pb-1">
        <button
          onClick={() => go("settings")}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors",
            view === "settings"
              ? "bg-neutral-800 text-neutral-50"
              : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200",
          )}
        >
          <div className="flex items-center gap-3">
            <Settings className="size-4" />
            <span>{t("settings", language)}</span>
          </div>
          {appUpdate?.hasUpdate && (
            <span className="flex items-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-400/20 px-2 py-0.5 text-[10px] font-bold text-gold-300 shadow-xs animate-pulse">
              v{appUpdate.latestVersion}
            </span>
          )}
        </button>

        <button
          onClick={() => go("settings")}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-left transition-colors hover:border-neutral-700"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-sm font-bold text-neutral-950">
            {(user?.name ?? "V").charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-xs font-medium text-neutral-200">
                {user?.name ?? "V Assistant"}
              </span>
            </div>
            <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
              Powered by VuaAI.net
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
