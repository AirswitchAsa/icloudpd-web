import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/api/client";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { pushError, pushSuccess } from "@/store/toastStore";
import type { AppSettings } from "@/types/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const query = useSettings();
  const update = useUpdateSettings();
  const [form, setForm] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(null);
      return;
    }
    if (query.data && form === null) {
      setForm(query.data);
    }
  }, [open, query.data, form]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    try {
      await update.mutateAsync(form);
      pushSuccess("Settings saved");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" widthClass="max-w-lg">
      {!form ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
      <form onSubmit={submit} className="space-y-4" noValidate>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Apprise URLs</legend>
          {form.apprise.urls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => {
                  const urls = [...form.apprise.urls];
                  urls[i] = e.target.value;
                  setForm({ ...form, apprise: { ...form.apprise, urls } });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setForm({
                    ...form,
                    apprise: {
                      ...form.apprise,
                      urls: form.apprise.urls.filter((_, j) => j !== i),
                    },
                  })
                }
              >Remove</Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setForm({ ...form, apprise: { ...form.apprise, urls: [...form.apprise.urls, ""] } })
            }
          >Add URL</Button>
          <div className="space-y-1 pt-2">
            {(["on_start", "on_success", "on_failure"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.apprise[k]}
                  onChange={(e) =>
                    setForm({ ...form, apprise: { ...form.apprise, [k]: e.target.checked } })
                  }
                />
                Notify {k.replace("on_", "")}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm text-slate-700">Run log retention (count per policy)</span>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={String(form.retention_runs)}
            onChange={(e) => {
              const n = Number(e.target.value);
              setForm({ ...form, retention_runs: e.target.value === "" || Number.isNaN(n) ? 0 : n });
            }}
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
      )}
    </Modal>
  );
}
