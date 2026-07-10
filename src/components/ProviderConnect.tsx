import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { getProvider, type ProviderId } from "@/lib/catalog";
import { DEFAULT_MODELS, type ProviderConfig } from "@/runtime/providers";
import { Button } from "@/components/ui/button";

const inputClass =
  "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 " +
  "text-sm outline-none placeholder:text-neutral-600 focus:border-gold-400/60";

/** Connect dialog: paste a key (or point at a local server) and go. */
export function ProviderConnect({
  provider,
  initial,
  onSave,
  onClose,
}: {
  provider: ProviderId;
  initial?: ProviderConfig;
  onSave: (config: ProviderConfig | null) => void;
  onClose: () => void;
}) {
  const info = getProvider(provider);
  const isLocal = provider === "local";
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(
    initial?.baseUrl ?? (isLocal ? "http://localhost:11434/v1" : ""),
  );
  const [model, setModel] = useState(initial?.model ?? "");

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

        <div className="mt-4 flex flex-col gap-3">
          {isLocal && (
            <label className="text-xs text-neutral-400">
              Server address
              <input
                className={`${inputClass} mt-1`}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
              />
            </label>
          )}
          <label className="text-xs text-neutral-400">
            API key{isLocal ? " (optional)" : ""}
            <input
              className={`${inputClass} mt-1`}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isLocal ? "usually not needed" : "sk-…"}
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

        {info.keyUrl && (
          <a
            href={info.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-gold-300 hover:underline"
          >
            Get an API key <ExternalLink className="size-3" />
          </a>
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
            <Button size="sm" disabled={!valid} onClick={save}>
              Connect
            </Button>
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">
          Your key is stored only on this device and sent only to{" "}
          {info.name}.
        </p>
      </div>
    </div>
  );
}
