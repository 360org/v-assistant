import {
  Blocks,
  Bot,
  CalendarClock,
  Download,
  Home,
  Image as ImageIcon,
  KeyRound,
  Library,
  MessageSquare,
  History,
  Settings,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type View } from "@/lib/store";
import { Logo } from "@/components/Logo";
import { SidebarAdBanner } from "@/components/SidebarAdBanner";

const items: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "chat", label: "Chat", icon: MessageSquare },
  { view: "sessions", label: "Sessions", icon: History },
  { view: "agents", label: "Agents", icon: Bot },
  { view: "skills", label: "Skills", icon: Wand2 },
  { view: "knowledge", label: "Knowledge", icon: Library },
  { view: "media", label: "Media Gallery", icon: ImageIcon },
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
  const { view, setView, user, appUpdate } = useApp();
  const currentVersion = appUpdate?.currentVersion || (typeof __V_ASSISTANT_VERSION__ !== "undefined" ? __V_ASSISTANT_VERSION__ : "1.1.0");

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

      {/* Dynamic VuaAI.net Promotional Ad Banner */}
      <div className="mt-auto px-1 py-1.5">
        <SidebarAdBanner />
      </div>

      {/* User cluster: Settings & Profile */}
      <div className="flex flex-col gap-1.5 px-2 pb-1">
        {/* Prominent 1-click update button when new version release is available */}
        {appUpdate?.hasUpdate && (
          <button
            onClick={() => {
              if (appUpdate.downloadUrl) {
                window.open(appUpdate.downloadUrl, "_blank");
              } else {
                go("settings");
              }
            }}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/90 to-emerald-900/80 px-3 py-2 text-xs font-semibold text-emerald-200 hover:border-emerald-400 hover:text-emerald-100 transition-all shadow-md group animate-in fade-in"
            title={`Cập nhật lên phiên bản v${appUpdate.latestVersion}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="size-3.5 text-emerald-400 animate-pulse shrink-0" />
              <span className="truncate">Cập nhật v{appUpdate.latestVersion}</span>
            </div>
            <Download className="size-3.5 shrink-0 text-emerald-400 group-hover:translate-y-0.5 transition-transform" />
          </button>
        )}

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
            <span>Settings</span>
          </div>
          {appUpdate?.hasUpdate && (
            <span className="flex items-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-400/20 px-2 py-0.5 text-[10px] font-bold text-gold-300 shadow-xs animate-pulse">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-75"></span>
                <span className="relative inline-flex size-1.5 rounded-full bg-gold-400"></span>
              </span>
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
              <span className="shrink-0 font-mono text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-1.5 py-0.5 rounded-md">
                v{currentVersion}
              </span>
            </div>
            <span className="block truncate text-[11px] text-neutral-500 mt-0.5">
              Powered by VuaAI.net
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
