import { useState } from "react";
import { ChevronDown, ExternalLink, Loader2, LogIn, X } from "lucide-react";
import { getProvider, type ProviderId } from "@/lib/catalog";
import { DEFAULT_MODELS, type ProviderConfig } from "@/runtime/providers";
import { openExternal, signIn } from "@/runtime/oauth";
import { routedConfig } from "@/runtime/providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 " +
  "text-sm outline-none placeholder:text-neutral-600 focus:border-gold-400/60";

/**
 * Connect dialog — login-first. Direct sign-in is the headline action;
 * the API-key path is tucked under "Advanced options" for people who
 * prefer a key or use a provider without OAuth yet. Local AI is the
 * exception: its "connection" is a server address, shown directly.
 */
export function ProviderConnect({
  provider,
  initial,
  onSave,
  onClose,
  context = "settings",
}: {
  provider: ProviderId;
  initial?: ProviderConfig;
  onSave: (config: ProviderConfig | null) => void;
  onClose: () => void;
  context?: "onboarding" | "settings";
}) {
  const info = getProvider(provider);
  const isLocal = provider === "local";
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(
    initial?.baseUrl ?? (isLocal ? "http://localhost:11434/v1" : ""),
  );
  const [model, setModel] = useState(initial?.model ?? "");
  // Advanced (key) section: open by default when editing an existing
  // key-based connection or when the provider has no direct sign-in.
  const [advanced, setAdvanced] = useState(
    Boolean(initial?.apiKey) || (!info.oauth && !isLocal),
  );
  const [signingIn, setSigningIn] = useState(false);

  const valid = isLocal ? baseUrl.trim() !== "" : apiKey.trim() !== "";

  const login = async () => {
    setSigningIn(true);
    try {
      const result = await signIn(provider, context);
      // Demo mode returns a credential in place; real mode navigated away.
      if (result) onSave(routedConfig(result.provider, result.apiKey));
    } finally {
      setSigningIn(false);
    }
  };

  const save = () => {
    onSave({
      apiKey: apiKey.trim() || undefined,
      baseUrl: isLocal ? baseUrl.trim() : undefined,
      model: model.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">Connect {info.name}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">{info.tagline}</p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {info.hint && (
          <p className="mt-3 text-xs text-neutral-400">{info.hint}</p>
        )}

        {/* Local AI: the connection is a server address, no login. */}
        {isLocal ? (
          <div className="mt-4 flex flex-col gap-3">
            <label className="text-xs text-neutral-400">
              Server address
              <input
                className={`${inputClass} mt-1`}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Model (optional)
              <input
                className={`${inputClass} mt-1`}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={DEFAULT_MODELS[provider]}
              />
            </label>
          </div>
        ) : info.oauth ? (
          <>
            {/* OpenRouter: real one-click OAuth. */}
            <Button
              className="mt-4 w-full"
              disabled={signingIn}
              onClick={() => void login()}
            >
              {signingIn ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <LogIn className="size-4" /> {info.loginLabel}
                </>
              )}
            </Button>

            {/* Advanced: API key fallback. */}
            <button
              onClick={() => setAdvanced((a) => !a)}
              className="mt-4 flex w-full cursor-pointer items-center justify-between text-xs text-neutral-400 hover:text-neutral-200"
            >
              Advanced options
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  advanced && "rotate-180",
                )}
              />
            </button>
            {advanced && (
              <div className="mt-3 flex flex-col gap-3 border-t border-neutral-800 pt-3">
                <label className="text-xs text-neutral-400">
                  API key
                  <input
                    className={`${inputClass} mt-1`}
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-…"
                  />
                </label>
                <label className="text-xs text-neutral-400">
                  Model (optional)
                  <input
                    className={`${inputClass} mt-1`}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={DEFAULT_MODELS[provider]}
                  />
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Direct to the vendor: open it → sign in → copy the key → paste
                it back. Connects straight to the vendor's own API. */}
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => info.keyUrl && void openExternal(info.keyUrl)}
            >
              <ExternalLink className="size-4" /> Open {info.name} to get your key
            </Button>
            <div className="mt-3 flex flex-col gap-3">
              <label className="text-xs text-neutral-400">
                Paste your {info.name} key
                <input
                  className={`${inputClass} mt-1`}
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste the key here"
                  autoFocus
                />
              </label>
              <label className="text-xs text-neutral-400">
                Model (optional)
                <input
                  className={`${inputClass} mt-1`}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={DEFAULT_MODELS[provider]}
                />
              </label>
            </div>
          </>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          {initial ? (
            <Button variant="danger" size="sm" onClick={() => onSave(null)}>
              Disconnect
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {(isLocal || advanced || !info.oauth) && (
              <Button size="sm" disabled={!valid} onClick={save}>
                {info.oauth ? "Save key" : "Connect"}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">
          Your credentials are stored only on this device and sent only to{" "}
          {info.name}.
        </p>
      </div>
    </div>
  );
}
