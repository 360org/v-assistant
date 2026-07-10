import { useState } from "react";
import { Check, Plug } from "lucide-react";
import { INTEGRATIONS } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Integrations() {
  const { connectedIntegrations, toggleIntegration } = useApp();
  const [connecting, setConnecting] = useState<string | null>(null);

  const connect = (id: string) => {
    // Real build: opens the service's OAuth window. One button, one login.
    setConnecting(id);
    setTimeout(() => {
      toggleIntegration(id);
      setConnecting(null);
    }, 700);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Integrations</h1>
      <p className="mt-1 text-neutral-400">
        One button. Sign in once, use everywhere.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {INTEGRATIONS.map((integration) => {
          const connected = connectedIntegrations.includes(integration.id);
          return (
            <Card key={integration.id} className="flex items-center gap-4">
              <span className="text-3xl">{integration.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{integration.name}</h3>
                  {connected && <Badge tone="green">Connected</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-neutral-400">
                  {integration.description}
                </p>
              </div>
              {connected ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleIntegration(integration.id)}
                >
                  <Check className="size-3.5 text-emerald-400" /> Done
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={connecting === integration.id}
                  onClick={() => connect(integration.id)}
                >
                  <Plug className="size-3.5" />
                  {connecting === integration.id ? "Connecting…" : "Connect"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
