/**
 * The 2-minute promise: Login → Connect → Start.
 * No configuration, no terminal, no API keys when the provider supports OAuth.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import {
  INTEGRATIONS,
  PROVIDERS,
  getProvider,
  type ProviderId,
} from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { signIn } from "@/runtime/oauth";
import { loginConfig } from "@/runtime/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { ProviderConnect } from "@/components/ProviderConnect";
import { cn } from "@/lib/utils";

type Step = "welcome" | "login" | "connect";

export function Onboarding() {
  const {
    completeOnboarding,
    connectProvider,
    oauthReturn,
    oauthError,
    user,
    providerConfigs,
  } = useApp();
  const [step, setStep] = useState<Step>("welcome");
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [connectFor, setConnectFor] = useState<ProviderId | null>(null);
  const [signingIn, setSigningIn] = useState<ProviderId | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  // Back from a provider's sign-in page: the account is connected, resume
  // at the integrations step.
  useEffect(() => {
    if (oauthReturn) {
      setProvider(oauthReturn.provider);
      setStep("connect");
    }
  }, [oauthReturn]);

  const choose = async (id: ProviderId) => {
    // Providers with direct sign-in log in one click; others open the
    // connect dialog (key under Advanced).
    if (!getProvider(id).oauth) {
      setConnectFor(id);
      return;
    }
    setSigningIn(id);
    try {
      const result = await signIn(id, "onboarding");
      if (result) {
        // Demo mode returns here; real mode has navigated away. The sign-in
        // routes the chosen vendor's models through the router key.
        await connectProvider(
          result.provider,
          loginConfig(result.provider, result.apiKey, result),
        );
        setProvider(result.provider);
        setStep("connect");
      }
    } finally {
      setSigningIn(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  const finish = () => {
    if (provider) completeOnboarding(provider, selected);
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md"
        >
          {step === "welcome" && (
            <div className="text-center">
              <Logo className="mx-auto size-20" />
              <h1 className="mt-6 text-3xl font-bold">V Assistant</h1>
              <p className="mt-2 text-neutral-400">
                AI for everyone. Set up in under 2 minutes — no configuration,
                no API keys, no technical knowledge.
              </p>
              <Button
                size="lg"
                className="mt-8 w-full"
                onClick={() => setStep("login")}
              >
                Get started <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {step === "login" && (
            <div>
              <h2 className="text-center text-2xl font-bold">Sign in</h2>
              <p className="mt-2 text-center text-sm text-neutral-400">
                Use the AI account you already have. You can switch anytime.
              </p>
              {oauthError && (
                <p className="mt-3 text-center text-xs text-red-400">
                  ⚠️ {oauthError}
                </p>
              )}
              <div className="mt-6 flex flex-col gap-2.5">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    disabled={signingIn !== null}
                    onClick={() => void choose(p.id)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition-colors disabled:opacity-60",
                      p.oauth
                        ? "border-gold-400/40 bg-gold-400/5 hover:border-gold-400/70 hover:bg-gold-400/10"
                        : "border-neutral-800 bg-neutral-900/60 hover:border-gold-400/50 hover:bg-neutral-800/70",
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {p.loginLabel}
                        {p.oauth && <Badge tone="gold">1-click</Badge>}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {signingIn === p.id ? "Signing you in…" : p.tagline}
                      </div>
                    </div>
                    {signingIn === p.id ? (
                      <Loader2 className="size-4 animate-spin text-gold-300" />
                    ) : (
                      <ArrowRight className="size-4 text-neutral-600" />
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setProvider("openrouter");
                  setStep("connect");
                }}
                className="mt-4 w-full cursor-pointer text-center text-sm text-neutral-500 hover:text-neutral-300"
              >
                Try the preview without an account
              </button>
            </div>
          )}

          {step === "connect" && (
            <div>
              <h2 className="text-center text-2xl font-bold">Connect</h2>
              <p className="mt-2 text-center text-sm text-neutral-400">
                Optional — connect once, use everywhere. You can add more later
                in Integrations.
              </p>
              <div className="mt-6 flex flex-col gap-2.5">
                {INTEGRATIONS.filter((i) => i.featured).map((i) => {
                  const on = selected.includes(i.id);
                  return (
                    <button
                      key={i.id}
                      onClick={() => toggle(i.id)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors",
                        on
                          ? "border-gold-400/60 bg-gold-400/10"
                          : "border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800/70",
                      )}
                    >
                      <span className="text-xl">{i.emoji}</span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{i.name}</div>
                        <div className="text-xs text-neutral-500">
                          {i.description}
                        </div>
                      </div>
                      {on && <Check className="size-4 text-gold-300" />}
                    </button>
                  );
                })}
              </div>
              <Button size="lg" className="mt-6 w-full" onClick={finish}>
                Start chatting <ArrowRight className="size-4" />
              </Button>
              <button
                onClick={finish}
                className="mt-3 w-full cursor-pointer text-center text-sm text-neutral-500 hover:text-neutral-300"
              >
                Skip for now
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {connectFor && (
        <ProviderConnect
          provider={connectFor}
          context="onboarding"
          hasSubscription={Boolean(user && providerConfigs["openrouter"]?.apiKey)}
          onClose={() => setConnectFor(null)}
          onSave={(config) => {
            if (config) void connectProvider(connectFor, config);
            setProvider(connectFor);
            setConnectFor(null);
            setStep("connect");
          }}
        />
      )}
    </div>
  );
}
