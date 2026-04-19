import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useRunHistory } from "@/hooks/useRuns";
import type { RunStatus, RunSummary } from "@/types/api";

const TONE: Record<RunStatus, "info" | "success" | "danger" | "neutral" | "warning"> = {
  running: "info",
  awaiting_mfa: "warning",
  success: "success",
  failed: "danger",
  stopped: "neutral",
};

interface Props {
  open: boolean;
  onClose: () => void;
  policyName: string | null;
  onViewLog: (run: RunSummary) => void;
}

export function RunHistoryModal({ open, onClose, policyName, onViewLog }: Props) {
  const { data, isLoading } = useRunHistory(open ? policyName : null);
  return (
    <Modal open={open} onClose={onClose} title={`History: ${policyName ?? ""}`} widthClass="max-w-2xl">
      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-slate-500">No runs yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500 text-left">
            <tr>
              <th className="py-2">Started</th>
              <th>Status</th>
              <th>Items</th>
              <th>Error ID</th>
              <th className="text-right">Log</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.run_id} className="border-t">
                <td className="py-1.5">{new Date(r.started_at).toLocaleString()}</td>
                <td><Badge tone={TONE[r.status]}>{r.status}</Badge></td>
                <td>{r.downloaded ?? 0}</td>
                <td className="font-mono text-xs">{r.error_id ?? ""}</td>
                <td className="text-right">
                  <Button variant="ghost" onClick={() => onViewLog(r)}>View</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
