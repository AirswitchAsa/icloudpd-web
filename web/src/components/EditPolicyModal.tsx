import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/api/client";
import { useSetPolicyPassword, useUpsertPolicy } from "@/hooks/usePolicies";
import { pushError, pushSuccess } from "@/store/toastStore";
import type { Policy, PolicyView } from "@/types/api";

interface Props {
  open: boolean;
  onClose: () => void;
  initial: PolicyView | null;
}

const BLANK: Policy = {
  name: "",
  username: "",
  directory: "",
  cron: "0 * * * *",
  enabled: true,
  timezone: null,
  icloudpd: {},
  notifications: { on_start: false, on_success: true, on_failure: true },
  aws: null,
};

export function EditPolicyModal({ open, onClose, initial }: Props) {
  const upsert = useUpsertPolicy();
  const setPassword = useSetPolicyPassword();

  const [form, setForm] = useState<Policy>(BLANK);
  const [password, setPasswordValue] = useState("");
  const [fieldError, setFieldError] = useState<{ field: string | null; message: string } | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initial ? stripView(initial) : BLANK);
      setPasswordValue("");
      setFieldError(null);
    }
  }, [open, initial]);

  const isNew = initial === null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    try {
      await upsert.mutateAsync({ name: form.name, policy: form });
      if (password) {
        await setPassword.mutateAsync({ name: form.name, password });
      }
      pushSuccess(isNew ? "Policy created" : "Policy saved");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldError({ field: err.field, message: err.message });
        pushError(err.message, err.errorId);
      } else {
        pushError("Unknown error");
      }
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isNew ? "New Policy" : `Edit: ${initial?.name}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" error={fieldError?.field === "name" ? fieldError.message : null}>
          <Input
            value={form.name}
            disabled={!isNew}
            invalid={fieldError?.field === "name"}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label="iCloud username" error={fieldError?.field === "username" ? fieldError.message : null}>
          <Input
            type="email"
            value={form.username}
            invalid={fieldError?.field === "username"}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </Field>
        <Field label="Directory" error={fieldError?.field === "directory" ? fieldError.message : null}>
          <Input
            value={form.directory}
            invalid={fieldError?.field === "directory"}
            onChange={(e) => setForm({ ...form, directory: e.target.value })}
            required
          />
        </Field>
        <Field label="Cron" error={fieldError?.field === "cron" ? fieldError.message : null}>
          <Input
            value={form.cron}
            invalid={fieldError?.field === "cron"}
            onChange={(e) => setForm({ ...form, cron: e.target.value })}
            required
          />
        </Field>
        <Field label="Timezone (IANA, optional)">
          <Input
            value={form.timezone ?? ""}
            onChange={(e) =>
              setForm({ ...form, timezone: e.target.value === "" ? null : e.target.value })
            }
            placeholder="America/New_York"
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Enabled
        </label>

        <fieldset className="border rounded p-3 space-y-2">
          <legend className="text-sm font-medium">Notifications</legend>
          {(["on_start", "on_success", "on_failure"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.notifications[k]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notifications: { ...form.notifications, [k]: e.target.checked },
                  })
                }
              />
              {k}
            </label>
          ))}
        </fieldset>

        <Field label={`iCloud password${initial?.has_password ? " (already set; fill to replace)" : ""}`}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <fieldset className="border rounded p-3 space-y-2">
          <legend className="text-sm font-medium">icloudpd CLI options (JSON)</legend>
          <IcloudpdOptions
            value={form.icloudpd}
            onChange={(next) => setForm({ ...form, icloudpd: next })}
          />
        </fieldset>

        <fieldset className="border rounded p-3 space-y-2">
          <legend className="text-sm font-medium">AWS S3 sync (optional)</legend>
          <AwsFields
            value={form.aws}
            onChange={(next) => setForm({ ...form, aws: next })}
          />
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={upsert.isPending || setPassword.isPending}>
            {upsert.isPending || setPassword.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-700">{label}</span>
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

function IcloudpdOptions({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);

  const blur = () => {
    try {
      onChange(JSON.parse(text));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div>
      <textarea
        className="w-full font-mono text-xs border rounded p-2 h-32"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={blur}
      />
      {err && <div className="text-xs text-danger">{err}</div>}
    </div>
  );
}

function AwsFields({
  value,
  onChange,
}: {
  value: Policy["aws"];
  onChange: (next: Policy["aws"]) => void;
}) {
  const on = value !== null;
  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { bucket: "", prefix: "", region: "", access_key_id: "", secret_access_key: "" }
                : null
            )
          }
        />
        Enable S3 sync
      </label>
      {on && value && (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="bucket" value={value.bucket} onChange={(e) => onChange({ ...value, bucket: e.target.value })} />
          <Input placeholder="prefix" value={value.prefix ?? ""} onChange={(e) => onChange({ ...value, prefix: e.target.value })} />
          <Input placeholder="region" value={value.region ?? ""} onChange={(e) => onChange({ ...value, region: e.target.value })} />
          <Input placeholder="access key id" value={value.access_key_id ?? ""} onChange={(e) => onChange({ ...value, access_key_id: e.target.value })} />
          <Input placeholder="secret access key" type="password" value={value.secret_access_key ?? ""} onChange={(e) => onChange({ ...value, secret_access_key: e.target.value })} />
        </div>
      )}
    </div>
  );
}

function stripView(view: PolicyView): Policy {
  const rest: Policy = {
    name: view.name,
    username: view.username,
    directory: view.directory,
    cron: view.cron,
    enabled: view.enabled,
    timezone: view.timezone ?? null,
    icloudpd: view.icloudpd,
    notifications: view.notifications,
    aws: view.aws,
  };
  return rest;
}
