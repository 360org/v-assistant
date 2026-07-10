import { useState } from "react";
import { useApp } from "@/lib/store";
import { PROVIDERS, getProvider, type ProviderId } from "@/lib/catalog";
import { isConfigured } from "@/runtime/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProviderConnect } from "@/components/ProviderConnect";
import { cn } from "@/lib/utils";

export function Settings() {
  const {
    provider,
    setProvider,
    providerConfigs,
    setProviderConfig,
    connectProvider,
    user,
    resetApp,
  } = useApp();
  const [connectFor, setConnectFor] = useState<ProviderId | null>(null);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-neutral-400">Simple by design.</p>

      {user && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-300">Account</h2>
          <Card className="mt-3 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-lg font-bold text-neutral-950">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{user.name}</div>
              <div className="text-xs text-neutral-500">
                Signed in with {getProvider(user.provider).name}
                {user.detail ? ` · ${user.detail}` : ""}
              </div>
            </div>
            <Badge tone="green">Local user</Badge>
          </Card>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-300">AI Provider</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Switch with one click. Your chats and knowledge stay.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const connected = isConfigured(p.id, providerConfigs[p.id]);
            return (
              <button
                key={p.id}
                onClick={() => {
                  setProvider(p.id);
                  if (!connected) setConnectFor(p.id);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors",
                  provider === p.id
                    ? "border-gold-400/60 bg-gold-400/10"
                    : "border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800/70",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {p.name}
                    {connected ? (
                      <Badge tone="green">Connected</Badge>
                    ) : (
                      <span className="text-[11px] font-normal text-neutral-600">
                        not connected
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500">{p.tagline}</div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnectFor(p.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        setConnectFor(p.id);
                      }
                    }}
                    className="mt-1 inline-block cursor-pointer text-xs text-gold-300 hover:underline"
                  >
                    {connected ? "Manage" : "Connect"}
                  </span>
                </div>
                {provider === p.id && <Badge tone="gold">Active</Badge>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-300">About</h2>
        <Card className="mt-3 text-sm text-neutral-400">
          <div className="font-semibold text-neutral-100">
            V Assistant Desktop
          </div>
          <div className="mt-1">Version 0.1.0</div>
          <div className="mt-1">
            AI for everyone — install in 2 minutes, use immediately.
          </div>
          <div className="mt-3 flex flex-col gap-1 border-t border-neutral-800 pt-3 text-xs">
            <span>
              Made by <span className="text-neutral-200">360org</span>
            </span>
            <a
              href="https://vuaai.net"
              target="_blank"
              rel="noreferrer"
              className="text-gold-300 hover:underline"
            >
              vuaai.net
            </a>
            <a
              href="mailto:support@vuaai.net"
              className="text-gold-300 hover:underline"
            >
              support@vuaai.net
            </a>
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-300">Danger zone</h2>
        <Card className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Reset app</div>
            <div className="text-xs text-neutral-500">
              Clears chats, agents, knowledge and returns to setup.
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={resetApp}>
            Reset
          </Button>
        </Card>
      </section>

      {connectFor && (
        <ProviderConnect
          provider={connectFor}
          initial={providerConfigs[connectFor]}
          onClose={() => setConnectFor(null)}
          onSave={(config) => {
            if (config) void connectProvider(connectFor, config);
            else setProviderConfig(connectFor, null);
            setConnectFor(null);
          }}
        />
      )}
    </div>
  );
}
