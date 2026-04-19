import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeEvents } from "@/api/sse";
import { useRunStore } from "@/store/runStore";
import type { RunStatus } from "@/types/api";

interface StatusPayload {
  status: RunStatus;
  error_id?: string | null;
}

interface ProgressPayload {
  downloaded: number;
  total: number;
}

interface LogPayload {
  line: string;
}

export function useRunEvents(runId: string | null, policyName: string | null) {
  const qc = useQueryClient();
  const init = useRunStore((s) => s.init);
  const appendLog = useRunStore((s) => s.appendLog);
  const setProgress = useRunStore((s) => s.setProgress);
  const setStatus = useRunStore((s) => s.setStatus);

  useEffect(() => {
    if (!runId || !policyName) return;
    init(runId, policyName);
    const sub = subscribeEvents(`/runs/${runId}/events`, {
      log: (data, id) => {
        const payload = data as LogPayload;
        appendLog(runId, payload.line, id);
      },
      progress: (data) => {
        const payload = data as ProgressPayload;
        setProgress(runId, payload.downloaded, payload.total);
      },
      status: (data) => {
        const payload = data as StatusPayload;
        setStatus(runId, payload.status, payload.error_id ?? null);
        if (payload.status !== "running" && payload.status !== "awaiting_mfa") {
          qc.invalidateQueries({ queryKey: ["policies"] });
          qc.invalidateQueries({ queryKey: ["runs", "history", policyName] });
        }
      },
    });
    return () => sub.close();
  }, [runId, policyName, init, appendLog, setProgress, setStatus, qc]);

  return useRunStore((s) => (runId ? s.runs[runId] ?? null : null));
}
