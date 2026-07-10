import { ArrowRight, Blocks, Bot, Library, MessageSquare } from "lucide-react";
import { useApp } from "@/lib/store";
import { AGENT_STORE, getProvider } from "@/lib/catalog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Home() {
  const {
    setView,
    provider,
    installedAgents,
    connectedIntegrations,
    knowledgeFiles,
  } = useApp();

  const shortcuts = [
    {
      view: "chat" as const,
      icon: MessageSquare,
      title: "Start a chat",
      description: "Ask anything — draft an email, explain a report, plan a trip.",
    },
    {
      view: "agents" as const,
      icon: Bot,
      title: "Install an agent",
      description: `${AGENT_STORE.length} ready-made experts, one click to install.`,
    },
    {
      view: "knowledge" as const,
      icon: Library,
      title: "Add knowledge",
      description: "Drop in PDF, Word, Excel or a folder. It just works.",
    },
    {
      view: "integrations" as const,
      icon: Blocks,
      title: "Connect apps",
      description: "Telegram, Google Drive, Slack and more — one button each.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Welcome back 👋</h1>
      <p className="mt-1 text-neutral-400">
        Everything is running{provider ? ` on ${getProvider(provider).name}` : ""}.
        What would you like to do?
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {shortcuts.map(({ view, icon: Icon, title, description }) => (
          <Card
            key={view}
            role="button"
            tabIndex={0}
            onClick={() => setView(view)}
            onKeyDown={(e) => e.key === "Enter" && setView(view)}
            className="group cursor-pointer transition-colors hover:border-gold-400/40"
          >
            <Icon className="size-5 text-gold-300" />
            <div className="mt-3 flex items-center gap-1.5 font-semibold">
              {title}
              <ArrowRight className="size-3.5 text-neutral-600 transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-sm text-neutral-400">{description}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Badge tone="gold">{installedAgents.length} agents installed</Badge>
        <Badge tone="green">
          {connectedIntegrations.length} integrations connected
        </Badge>
        <Badge>{knowledgeFiles.length} knowledge files</Badge>
      </div>
    </div>
  );
}
