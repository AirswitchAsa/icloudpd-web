import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/api/client";
import { runsApi } from "@/api/runs";

interface Props {
  open: boolean;
  onClose: () => void;
  runId: string | null;
}

export function LogViewerModal({ open, onClose, runId }: Props) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !runId) return;
    setText("");
    setErr(null);
    fetch(runsApi.logUrl(runId), { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new ApiError("Log not found", r.status, null, null);
        return r.text();
      })
      .then(setText)
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [open, runId]);

  return (
    <Modal open={open} onClose={onClose} title={`Log: ${runId ?? ""}`} widthClass="max-w-3xl">
      {err ? (
        <div className="text-danger text-sm">{err}</div>
      ) : (
        <pre className="font-mono text-xs bg-slate-900 text-slate-100 rounded p-3 h-[60vh] overflow-auto whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </Modal>
  );
}
