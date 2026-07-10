import { AnimatePresence, motion } from "framer-motion";
import { useApp, type View } from "@/lib/store";
import { Sidebar } from "@/components/Sidebar";
import { Onboarding } from "@/pages/Onboarding";
import { Home } from "@/pages/Home";
import { Chat } from "@/pages/Chat";
import { Agents } from "@/pages/Agents";
import { Knowledge } from "@/pages/Knowledge";
import { Integrations } from "@/pages/Integrations";
import { Settings } from "@/pages/Settings";

const pages: Record<View, () => JSX.Element> = {
  home: Home,
  chat: Chat,
  agents: Agents,
  knowledge: Knowledge,
  integrations: Integrations,
  settings: Settings,
};

export default function App() {
  const { onboarded, view } = useApp();

  if (!onboarded) {
    return <Onboarding />;
  }

  const Page = pages[view];

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
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
