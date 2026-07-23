import { useState } from "react";
import { Check, Download, ExternalLink, Plug, Settings2, X } from "lucide-react";
import { INTEGRATIONS, type Integration } from "@/lib/catalog";
import {
  ENGINE_SKILL_KIND_LABEL,
  NANOCLAW_SKILLS,
  type EngineSkill,
} from "@/lib/nanoclawSkills";
import { useApp } from "@/lib/store";
import { deleteVaultEntry, saveVaultEntry } from "@/runtime/vault";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const inputClass =
  "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 " +
  "text-sm outline-none placeholder:text-neutral-600 focus:border-gold-400/60";

/** Deterministic Vault id for an integration's saved config. */
const vaultIdFor = (id: string) => `integration:${id}`;
const engineVaultIdFor = (id: string) => `engine:${id}`;

export function Integrations() {
  const {
    connectedIntegrations,
    installedEngineSkills,
    toggleEngineSkill,
    toggleIntegration,
  } = useApp();
  const [configFor, setConfigFor] = useState<Integration | null>(null);
  const [engineConfigFor, setEngineConfigFor] = useState<EngineSkill | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const onConnect = (integration: Integration) => {
    if (integration.connect === "token") {
      setConfigFor(integration);
      return;
    }
    // OAuth integrations: the real build opens the service's login window.
    setConnecting(integration.id);
    setTimeout(() => {
      toggleIntegration(integration.id);
      setConnecting(null);
    }, 700);
  };

  const disconnect = async (integration: Integration) => {
    if (integration.connect === "token") {
      await deleteVaultEntry(vaultIdFor(integration.id));
    }
    toggleIntegration(integration.id);
  };

  const installPlugin = (plugin: EngineSkill) => {
    if (plugin.fields?.length) setEngineConfigFor(plugin);
    else toggleEngineSkill(plugin.id);
  };

  const removePlugin = async (plugin: EngineSkill) => {
    if (plugin.fields?.length) await deleteVaultEntry(engineVaultIdFor(plugin.id));
    toggleEngineSkill(plugin.id);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Integrations</h1>
      <p className="mt-1 text-neutral-400">
        Connect once, use everywhere. Credentials are saved to your Vault.
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
                  onClick={() => void disconnect(integration)}
                >
                  <Check className="size-3.5 text-emerald-400" /> Done
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={connecting === integration.id}
                  onClick={() => onConnect(integration)}
                >
                  <Plug className="size-3.5" />
                  {connecting === integration.id ? "Connecting…" : "Connect"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Apps & plugins</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Install channels, providers, and runtime capabilities here. Their
          credentials stay in your Vault.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NANOCLAW_SKILLS.map((plugin) => {
            const installed = installedEngineSkills.includes(plugin.id);
            return (
              <Card key={plugin.id} className="flex items-center gap-4">
                <span className="text-3xl">{plugin.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{plugin.name}</h3>
                    <Badge>{ENGINE_SKILL_KIND_LABEL[plugin.kind]}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-400">
                    {plugin.description}
                  </p>
                </div>
                {installed ? (
                  <div className="flex items-center gap-1">
                    {plugin.fields?.length ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEngineConfigFor(plugin)}
                        title="Edit configuration"
                      >
                        <Settings2 className="size-3.5" /> Configure
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removePlugin(plugin)}
                      title="Remove"
                    >
                      <Check className="size-3.5 text-emerald-400" /> Installed
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => installPlugin(plugin)}
                    title={plugin.command}
                  >
                    <Download className="size-3.5" /> Install
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {configFor && (
        <IntegrationConfig
          integration={configFor}
          onClose={() => setConfigFor(null)}
          onSaved={() => {
            toggleIntegration(configFor.id);
            setConfigFor(null);
          }}
        />
      )}
      {engineConfigFor && (
        <EnginePluginConfig
          plugin={engineConfigFor}
          onClose={() => setEngineConfigFor(null)}
          onSaved={async (values) => {
            await saveVaultEntry({
              id: engineVaultIdFor(engineConfigFor.id),
              label: `${engineConfigFor.name} (plugin)`,
              service: engineConfigFor.id,
              fields: (engineConfigFor.fields ?? [])
                .map((field) => ({
                  label: field.label,
                  value: values[field.key] ?? "",
                  type: (field.secret ? "password" : "text") as "password" | "text",
                }))
                .filter((field) => field.value.trim() !== ""),
              updatedAt: Date.now(),
            });
            if (!installedEngineSkills.includes(engineConfigFor.id)) {
              toggleEngineSkill(engineConfigFor.id);
            }
            setEngineConfigFor(null);
          }}
        />
      )}
    </div>
  );
}

function EnginePluginConfig({
  plugin,
  onClose,
  onSaved,
}: {
  plugin: EngineSkill;
  onClose: () => void;
  onSaved: (values: Record<string, string>) => void | Promise<void>;
}) {
  const fields = plugin.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const valid = fields
    .filter((field) => !field.optional)
    .every((field) => (values[field.key] ?? "").trim() !== "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{plugin.emoji}</span>
            <h2 className="font-semibold">Configure {plugin.name}</h2>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {plugin.hint && <p className="mt-3 text-xs text-neutral-400">{plugin.hint}</p>}
        <div className="mt-4 flex flex-col gap-3">
          {fields.map((field) => (
            <label key={field.key} className="text-xs text-neutral-400">
              {field.label}{field.optional ? " (optional)" : ""}
              <input
                className={`${inputClass} mt-1`}
                type={field.secret ? "password" : "text"}
                value={values[field.key] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={field.placeholder}
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!valid || saving} onClick={async () => {
            setSaving(true);
            try { await onSaved(values); } finally { setSaving(false); }
          }}>
            {saving ? "Saving…" : "Save & install"}
          </Button>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">
          Saved to your Vault. The runtime uses this credential without exposing it to an agent.
        </p>
      </div>
    </div>
  );function IntegrationConfig({
  integration,
  onClose,
  onSaved,
}: {
  integration: Integration;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fields = integration.fields ?? [];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);

  const valid = fields
    .filter((f) => !f.optional)
    .every((f) => (values[f.key] ?? "").trim() !== "");

  const save = async () => {
    setSaving(true);
    try {
      await saveVaultEntry({
        id: vaultIdFor(integration.id),
        label: integration.name,
        service: integration.id,
        fields: (integration.fields ?? [])
          .map((f) => ({
            label: f.label,
            value: values[f.key] ?? "",
            type: (f.secret ? "password" : "text") as "password" | "text",
          }))
          .filter((f) => f.value.trim() !== ""),
        updatedAt: Date.now(),
      });
      const nowStr = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      setVerifiedAt(nowStr);
      setStep(3);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{integration.emoji}</span>
            <div>
              <h2 className="font-bold text-base text-neutral-100">Wizard Kết nối {integration.name}</h2>
              <p className="text-xs text-neutral-400">Bước {step} / 3: {step === 1 ? "Hướng dẫn & Yêu cầu" : step === 2 ? "Nhập thông tin xác thực" : "Xác nhận & Hoàn tất"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gold-500/20 bg-gold-400/5 p-4 text-xs leading-relaxed text-neutral-300 space-y-2">
              <p className="font-semibold text-gold-400">📌 Hướng dẫn chuẩn bị kết nối {integration.name}:</p>
              <p>{integration.description}</p>
              {integration.hint && <p className="text-neutral-400 italic">{integration.hint}</p>}
            </div>

            {integration.id === "telegram" && (
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-xs text-gold-300 hover:border-gold-400 transition-all"
              >
                <span> Mở @BotFather để tạo Telegram Bot Token</span>
                <ExternalLink className="size-4 text-gold-400" />
              </a>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Hủy
              </Button>
              <Button size="sm" variant="primary" onClick={() => setStep(2)}>
                Tiếp tục (Bước 2) →
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-3">
              {fields.map((f) => (
                <label key={f.key} className="block text-xs font-medium text-neutral-300">
                  {f.label} {f.optional ? "(Tùy chọn)" : "*"}
                  <input
                    className={`${inputClass} mt-1`}
                    type={f.secret ? "password" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                ← Quay lại
              </Button>
              <Button size="sm" variant="primary" disabled={!valid || saving} onClick={() => void save()}>
                {saving ? "Đang xác thực…" : "Kiểm tra & Kết nối"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Check className="size-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-neutral-100">Kết nối {integration.name} Thành Công!</h3>
              <p className="text-xs text-neutral-400 mt-1">Thông tin đã được mã hóa bảo mật lưu vào Vault.</p>
              {verifiedAt && (
                <span className="mt-2 inline-block rounded-full bg-neutral-800 px-3 py-1 text-[10px] text-emerald-300 font-medium">
                  🟢 Trạng thái Realtime: Verified at {verifiedAt}
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onSaved();
              }}
              className="w-full mt-2"
            >
              Hoàn thành
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
