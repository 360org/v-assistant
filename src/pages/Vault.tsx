import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteVaultEntry,
  getVaultEntry,
  listVaultEntries,
  newVaultId,
  saveVaultEntry,
  vaultIsSecure,
  type VaultEntry,
  type VaultEntryMeta,
  type VaultField,
} from "@/runtime/vault";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const inputClass =
  "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 " +
  "text-sm outline-none placeholder:text-neutral-600 focus:border-gold-400/60";

const blank = (): VaultEntry => ({
  id: newVaultId(),
  label: "",
  url: "",
  username: "",
  password: "",
  notes: "",
  fields: [],
  updatedAt: Date.now(),
});

export function Vault() {
  const [entries, setEntries] = useState<VaultEntryMeta[]>([]);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setEntries(await listVaultEntries());
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const startEdit = async (id: string) => {
    setEditing((await getVaultEntry(id)) ?? blank());
  };

  const remove = async (id: string) => {
    await deleteVaultEntry(id);
    await refresh();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vault</h1>
          <p className="mt-1 text-neutral-400">
            Save a service's login once. Your agents use it to act for you —
            no re-entering passwords.
          </p>
        </div>
        <Button onClick={() => setEditing(blank())}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
        <Lock className="size-3.5" />
        {vaultIsSecure()
          ? "Stored in your device's secure keychain."
          : "Stored locally in this browser (the desktop app uses your OS keychain)."}
      </div>

      {loading ? null : entries.length === 0 ? (
        <Card className="mt-8 flex flex-col items-center gap-2 py-12 text-center">
          <KeyRound className="size-8 text-gold-300" />
          <div className="font-semibold">No saved logins yet</div>
          <p className="max-w-sm text-sm text-neutral-500">
            Add a website or service with its URL and login. Then just ask an
            agent — e.g. "post this to my blog" — and it signs in for you.
          </p>
        </Card>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-gold-300">
                <KeyRound className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.label}</div>
                {e.service && (
                  <div className="text-xs text-neutral-500">{e.service}</div>
                )}
              </div>
              <button
                onClick={() => void startEdit(e.id)}
                className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                title="Edit"
              >
                <Pencil className="size-4" />
              </button>
              <button
                onClick={() => void remove(e.id)}
                className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                title="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <VaultEditor
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function VaultEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: VaultEntry;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<VaultEntry>(entry);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<VaultEntry>) =>
    setForm((f) => ({ ...f, ...patch }));

  const valid = useMemo(() => form.label.trim().length > 0, [form.label]);

  const setCustom = (i: number, patch: Partial<VaultField>) =>
    setForm((f) => ({
      ...f,
      fields: (f.fields ?? []).map((row, idx) =>
        idx === i ? { ...row, ...patch } : row,
      ),
    }));
  const addCustom = () =>
    setForm((f) => ({
      ...f,
      fields: [...(f.fields ?? []), { label: "", value: "", secret: false }],
    }));
  const removeCustom = (i: number) =>
    setForm((f) => ({
      ...f,
      fields: (f.fields ?? []).filter((_, idx) => idx !== i),
    }));

  const save = async () => {
    setSaving(true);
    try {
      await saveVaultEntry({
        ...form,
        label: form.label.trim(),
        // Drop custom rows with no name.
        fields: (form.fields ?? []).filter((f) => f.label.trim() !== ""),
        updatedAt: Date.now(),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: "label" | "url" | "username" | "password" | "notes",
    opts: { placeholder?: string; type?: string } = {},
  ) => (
    <label className="text-xs text-neutral-400">
      {label}
      <input
        className={`${inputClass} mt-1`}
        type={opts.type ?? "text"}
        value={form[key] ?? ""}
        onChange={(e) => set({ [key]: e.target.value } as Partial<VaultEntry>)}
        placeholder={opts.placeholder}
      />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {entry.label ? "Edit login" : "Add login"}
          </h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Default fields */}
        <div className="mt-4 flex flex-col gap-3">
          {field("Name *", "label", { placeholder: "My WordPress blog" })}
          {field("URL / endpoint", "url", {
            placeholder: "https://blog.example.com",
          })}
          {field("Username / email", "username")}
          {field("Password", "password", { type: "password" })}
          {field("Notes", "notes")}
        </div>

        {/* Custom fields the user adds themselves */}
        {(form.fields ?? []).length > 0 && (
          <div className="mt-4 flex flex-col gap-2 border-t border-neutral-800 pt-4">
            <div className="text-xs font-medium text-neutral-400">
              Custom fields
            </div>
            {(form.fields ?? []).map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${inputClass} w-2/5`}
                  value={row.label}
                  onChange={(e) => setCustom(i, { label: e.target.value })}
                  placeholder="Field name"
                />
                <input
                  className={`${inputClass} flex-1`}
                  type={row.secret ? "password" : "text"}
                  value={row.value}
                  onChange={(e) => setCustom(i, { value: e.target.value })}
                  placeholder="Value"
                />
                <button
                  onClick={() => setCustom(i, { secret: !row.secret })}
                  className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                  title={row.secret ? "Show value" : "Hide value"}
                >
                  {row.secret ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
                <button
                  onClick={() => removeCustom(i)}
                  className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                  title="Remove field"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addCustom}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-gold-300 hover:underline"
        >
          <Plus className="size-3.5" /> Add field
        </button>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!valid || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save to Vault"}
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-neutral-600">
          <Badge tone="green">Agents can use this</Badge>
          Ask an agent to act on this service and it reads the login from here.
        </div>
      </div>
    </div>
  );
}
