import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useRunEvents } from "@/hooks/useRunEvents";
import { useStopRun } from "@/hooks/useRuns";
import { MfaModal } from "./MfaModal";
import type { RunStatus } from "@/types/api";

const STATUS_TONE: Record<RunStatus, "info" | "success" | "danger" | "neutral" | "warning"> = {
  running: "info",
  awaiting_mfa: "warning",
  success: "success",
  failed: "danger",
  stopped: "neutral",
};

interface Props {
  open: boolean;
  onClose: () => void;
  runId: string | null;
  policyName: string | null;
}

export function RunDetailModal({ open, onClose, runId, policyName }: Props) {
  const run = useRunEvents(open ? runId : null, open ? policyName : null);
  const stop = useStopRun();
  const logRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [mfaOpen, setMfaOpen] = useState(false);

  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [run?.logs.length, autoScroll]);

  useEffect(() => {
    if (run?.status === "awaiting_mfa") setMfaOpen(true);
  }, [run?.status]);

  if (!runId || !policyName) return null;

  const progressPercent =
    run && run.total > 0 ? Math.min(100, Math.round((run.downloaded / run.total) * 100)) : null;

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Run: ${policyName}`} widthClass="max-w-3xl">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone={run ? STATUS_TONE[run.status] : "neutral"}>
              {run?.status ?? "connecting…"}
            </Badge>
            {run?.errorId && (
              <span className="text-xs text-slate-500">Error ID: {run.errorId}</span>
            )}
          </div>

          {progressPercent !== null && (
            <div>
              <div className="h-2 bg-slate-200 rounded overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {run?.downloaded} / {run?.total} ({progressPercent}%)
              </div>
            </div>
          )}

          <div
            ref={logRef}
            className="font-mono text-xs bg-slate-900 text-slate-100 rounded p-3 h-80 overflow-auto whitespace-pre-wrap"
            onScroll={(e) => {
              const el = e.currentTarget;
              const near = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
              setAutoScroll(near);
            }}
          >
            {run?.logs.map((l) => (
              <div key={l.seq}>{l.line}</div>
            )) ?? null}
          </div>

          <div className="flex justify-between items-center">
            <label className="text-xs text-slate-600 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              auto-scroll
            </label>
            <div className="flex gap-2">
              {run?.status === "running" && (
                <Button variant="danger" onClick={() => stop.mutate(runId)}>Stop run</Button>
              )}
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      </Modal>
      <MfaModal
        open={mfaOpen}
        policyName={policyName}
        onClose={() => setMfaOpen(false)}
      />
    </>
  );
}
