/**
 * The 2-minute promise: Login → Connect → Start.
 * No configuration, no terminal, no API keys when the provider supports OAuth.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { INTEGRATIONS, PROVIDERS, type ProviderId } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

type Step = "welcome" | "login" | "connect";

export function Onboarding() {
  const { completeOnboarding } = useApp();
  const [step, setStep] = useState<Step>("welcome");
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [connecting, setConnecting] = useState<ProviderId | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const chooseProvider = (id: ProviderId) => {
    // Real build: opens the provider's OAuth window. The demo engine skips
    // straight to connected so the flow stays under two minutes.
    setConnecting(id);
    setTimeout(() => {
      setProvider(id);
      setConnecting(null);
      setStep("connect");
    }, 700);
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
              <Logo className="mx-auto size-16 rounded-3xl text-3xl" />
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
              <div className="mt-6 flex flex-col gap-2.5">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    disabled={connecting !== null}
                    onClick={() => chooseProvider(p.id)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-3.5 text-left transition-colors",
                      "hover:border-gold-400/50 hover:bg-neutral-800/70",
                      "disabled:pointer-events-none disabled:opacity-60",
                    )}
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {p.loginLabel}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {p.tagline}
                      </div>
                    </div>
                    {connecting === p.id ? (
                      <Sparkles className="size-4 animate-pulse text-gold-300" />
                    ) : (
                      <ArrowRight className="size-4 text-neutral-600" />
                    )}
                  </button>
                ))}
              </div>
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
    </div>
  );
}
