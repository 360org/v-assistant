import {
  Blocks,
  Bot,
  Home,
  Library,
  MessageSquare,
  Settings,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type View } from "@/lib/store";
import { getProvider } from "@/lib/catalog";
import { Logo } from "@/components/Logo";

const items: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "chat", label: "Chat", icon: MessageSquare },
  { view: "agents", label: "Agents", icon: Bot },
  { view: "skills", label: "Skills", icon: Wand2 },
  { view: "knowledge", label: "Knowledge", icon: Library },
  { view: "integrations", label: "Integrations", icon: Blocks },
  { view: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called after picking a menu item (used to close the mobile drawer). */
  onNavigate?: () => void;
}) {
  const { view, setView, provider } = useApp();
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

      <div className="mt-auto px-2 pb-1">
        {provider && (
          <button
            onClick={() => go("settings")}
            className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-left text-xs text-neutral-400 transition-colors hover:border-neutral-700"
          >
            <span className="size-2 rounded-full bg-emerald-400" />
            <span>
              Powered by{" "}
              <span className="font-medium text-neutral-200">
                {getProvider(provider).name}
              </span>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
