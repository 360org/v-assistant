import { useState } from "react";
import { ChevronDown, ExternalLink, LogIn, X } from "lucide-react";
import { getProvider, type ProviderId } from "@/lib/catalog";
import { DEFAULT_MODELS, type ProviderConfig } from "@/runtime/providers";
import { startOpenRouterLogin } from "@/runtime/oauth";
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

  const valid = isLocal ? baseUrl.trim() !== "" : apiKey.trim() !== "";

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
        ) : (
          <>
            {/* Headline: direct sign-in. */}
            {info.oauth ? (
              <Button
                className="mt-4 w-full"
                onClick={() => void startOpenRouterLogin(context)}
              >
                <LogIn className="size-4" /> {info.loginLabel}
              </Button>
            ) : (
              <p className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs text-neutral-400">
                One-click sign-in for {info.name} is coming once the vendor
                opens it. For now, use an API key below — or sign in with
                OpenRouter to reach {info.name}'s models instantly.
              </p>
            )}

            {/* Advanced: API key path. */}
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
                {info.keyUrl && (
                  <a
                    href={info.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gold-300 hover:underline"
                  >
                    Get an API key <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            )}
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
            {(isLocal || advanced) && (
              <Button size="sm" disabled={!valid} onClick={save}>
                {isLocal ? "Connect" : "Save key"}
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
