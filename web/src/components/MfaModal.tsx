import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/api/client";
import { mfaApi } from "@/api/mfa";
import { pushError, pushSuccess } from "@/store/toastStore";

interface Props {
  open: boolean;
  policyName: string;
  onClose: () => void;
}

export function MfaModal({ open, policyName, onClose }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await mfaApi.submit(policyName, code.trim());
      pushSuccess("MFA code submitted");
      setCode("");
      onClose();
    } catch (e2) {
      if (e2 instanceof ApiError) {
        setErr(e2.message);
        pushError(e2.message, e2.errorId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Two-factor code" widthClass="max-w-sm">
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-slate-700">
          Enter the 6-digit code from your Apple device for <strong>{policyName}</strong>.
        </p>
        <Input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]{6}"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          invalid={err !== null}
          placeholder="123456"
        />
        {err && <div className="text-xs text-danger">{err}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
