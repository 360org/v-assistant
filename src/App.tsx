import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useApp, type View } from "@/lib/store";
import { Sidebar } from "@/components/Sidebar";
import { Logo } from "@/components/Logo";
import { Onboarding } from "@/pages/Onboarding";
import { Home } from "@/pages/Home";
import { Chat } from "@/pages/Chat";
import { Agents } from "@/pages/Agents";
import { Skills } from "@/pages/Skills";
import { Knowledge } from "@/pages/Knowledge";
import { Vault } from "@/pages/Vault";
import { Scheduled } from "@/pages/Scheduled";
import { Integrations } from "@/pages/Integrations";
import { Settings } from "@/pages/Settings";

const pages: Record<View, () => JSX.Element> = {
  home: Home,
  chat: Chat,
  agents: Agents,
  skills: Skills,
  knowledge: Knowledge,
  vault: Vault,
  scheduled: Scheduled,
  integrations: Integrations,
  settings: Settings,
};

export default function App() {
  const { onboarded, view } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!onboarded) {
    return <Onboarding />;
  }

  const Page = pages[view];

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-900/40 px-4 py-2.5 md:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="cursor-pointer rounded-lg p-1.5 text-neutral-300 hover:bg-neutral-800"
        >
          <Menu className="size-5" />
        </button>
        <Logo className="size-7" />
        <span className="text-sm font-semibold">V Assistant</span>
      </header>

      {/* Desktop sidebar */}
      <Sidebar className="hidden md:flex" />

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 md:hidden"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "tween", duration: 0.2 }}
            >
              <Sidebar
                className="bg-neutral-950"
                onNavigate={() => setMenuOpen(false)}
              />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="absolute right-2 top-3 cursor-pointer rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800"
              >
                <X className="size-5" />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            className="h-full"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <Page />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
