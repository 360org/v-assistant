/**
 * The 2-minute promise: Login → Connect → Start.
 * No configuration, no terminal, no API keys when the provider supports OAuth.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Loader2 } from "lucide-react";
import {
  INTEGRATIONS,
  PROVIDERS,
  getProvider,
  type ProviderId,
} from "@/lib/catalog";
import { useApp } from "@/lib/store";
import {
  beginManualSignIn,
  completeManualSignIn,
  type ManualSignInAttempt,
  signIn,
} from "@/runtime/oauth";
import { inDesktopShell } from "@/runtime/proxy";
import { invoke } from "@tauri-apps/api/core";
import { loginConfig } from "@/runtime/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { ProviderConnect } from "@/components/ProviderConnect";
import { cn } from "@/lib/utils";

type Step = "welcome" | "login" | "manual" | "connect";

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
  const [signInError, setSignInError] = useState<string | null>(null);
  const [manualAttempt, setManualAttempt] = useState<ManualSignInAttempt | null>(null);
  const [manualCallback, setManualCallback] = useState("");
  const [copiedAuthUrl, setCopiedAuthUrl] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // Browser-mode OAuth may still relay a completed callback through app state.
  // Desktop onboarding uses the explicit callback form below instead.
  useEffect(() => {
    if (oauthReturn) {
      setProvider(oauthReturn.provider);
      completeOnboarding(oauthReturn.provider, []);
    }
  }, [completeOnboarding, oauthReturn]);

  const choose = async (id: ProviderId) => {
    // Providers with direct sign-in log in one click; others open the
    // connect dialog (key under Advanced).
    if (!getProvider(id).oauth) {
      setConnectFor(id);
      return;
    }
    setSignInError(null);
    setSigningIn(id);
    try {
      if (inDesktopShell()) {
        const checkHealth = async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1500);
          try {
            const response = await fetch("http://127.0.0.1:20128/health", { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
          } finally {
            clearTimeout(timeoutId);
          }
        };

        const waitForHealth = async () => {
          const deadline = Date.now() + 10_000;
          let lastError = "chưa phản hồi";
          while (Date.now() < deadline) {
            try {
              await checkHealth();
              return;
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
              await new Promise((resolve) => setTimeout(resolve, 250));
            }
          }
          throw new Error(`AI Router chưa sẵn sàng (${lastError}).`);
        };

        try {
          await waitForHealth();
        } catch {
          try {
            await invoke("runtime_restart_ai_router");
            await waitForHealth();
          } catch {
            throw new Error("AI Router chưa khởi động. Vui lòng kiểm tra Diagnostic trong Settings hoặc khởi động lại ứng dụng.");
          }
        }
        const attempt = await beginManualSignIn(id);
        setManualAttempt(attempt);
        setManualCallback("");
        setStep("manual");
        return;
      }
      const result = await signIn(id, "onboarding");
      if (result) {
        // A successful first sign-in creates the local profile, then enters
        // the app. Integrations remain optional and are configurable later.
        await connectProvider(
          result.provider,
          loginConfig(result.provider, result.apiKey, result),
        );
        completeOnboarding(result.provider, []);
      }
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : String(error));
    } finally {
      setSigningIn(null);
    }
  };

  const copyAuthUrl = () => {
    if (!manualAttempt) return;
    void navigator.clipboard.writeText(manualAttempt.authUrl);
    setCopiedAuthUrl(true);
    window.setTimeout(() => setCopiedAuthUrl(false), 2000);
  };

  const completeManualLogin = async () => {
    if (!manualAttempt) return;
    setSigningIn(manualAttempt.provider);
    setSignInError(null);
    try {
      const result = await completeManualSignIn(manualAttempt, manualCallback);
      await connectProvider(result.provider, loginConfig(result.provider, result.apiKey, result));
      completeOnboarding(result.provider, []);
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : String(error));
    } finally {
      setSigningIn(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  const finish = () => {
    if (provider) {
      completeOnboarding(provider, selected);
    } else {
      setSignInError("Không xác định được tài khoản AI. Vui lòng thử đăng nhập lại.");
      setStep("login");
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div key={step} className="w-full max-w-md animate-[page-in_200ms_ease-out]">
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
              {(oauthError || signInError) && (
                <p className="mt-3 text-center text-xs text-red-400">
                  ⚠️ {signInError || oauthError}
                </p>
              )}
              <div className="mt-6 flex flex-col gap-2.5">
                {PROVIDERS.filter((p) => p.id !== "openrouter").map((p) => (
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

          {step === "manual" && manualAttempt && (
            <div>
              <h2 className="text-center text-2xl font-bold">Complete sign in</h2>
              <p className="mt-2 text-center text-sm text-neutral-400">
                Finish approval in your browser, then paste the callback URL or code here. You will enter Chat immediately after verification.
              </p>
              <div className="mt-6 border border-neutral-800 bg-neutral-900 p-3">
                <div className="text-xs font-medium text-neutral-300">Sign-in URL</div>
                <div className="mt-2 flex gap-2">
                  <input
                    readOnly
                    value={manualAttempt.authUrl}
                    className="min-w-0 flex-1 border border-neutral-700 bg-neutral-950 px-2 py-2 font-mono text-xs text-neutral-400"
                  />
                  <Button size="sm" variant="secondary" title="Copy sign-in URL" onClick={copyAuthUrl}>
                    {copiedAuthUrl ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
                <label className="mt-4 block text-xs font-medium text-neutral-300" htmlFor="oauth-callback">
                  Callback URL or authorization code
                </label>
                <input
                  id="oauth-callback"
                  value={manualCallback}
                  onChange={(event) => setManualCallback(event.target.value)}
                  placeholder="http://localhost/.../callback?code=..."
                  className="mt-2 w-full border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs outline-none focus:border-gold-400/60"
                />
                {signInError && <p className="mt-2 text-xs text-red-400">⚠️ {signInError}</p>}
                <Button className="mt-3 w-full" disabled={!manualCallback.trim() || signingIn !== null} onClick={() => void completeManualLogin()}>
                  {signingIn ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  Continue to chat
                </Button>
              </div>
              <button className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-neutral-300" onClick={() => {
                setSignInError(null);
                setManualAttempt(null);
                setStep("login");
              }}>
                Choose a different account
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
      </div>

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
