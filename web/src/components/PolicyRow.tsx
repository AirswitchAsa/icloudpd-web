import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PolicyView } from "@/types/api";

interface Props {
  policy: PolicyView;
  onRun: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onOpenActiveRun: () => void;
}

function statusOf(p: PolicyView): { label: string; tone: "success" | "danger" | "info" | "neutral" | "warning" } {
  if (p.is_running) return { label: "Running", tone: "info" };
  if (p.last_run?.status === "failed") return { label: "Failed", tone: "danger" };
  if (p.last_run?.status === "success") return { label: "OK", tone: "success" };
  if (!p.enabled) return { label: "Disabled", tone: "neutral" };
  return { label: "Idle", tone: "neutral" };
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function PolicyRow({
  policy,
  onRun,
  onStop,
  onEdit,
  onDelete,
  onHistory,
  onOpenActiveRun,
}: Props) {
  const status = statusOf(policy);
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{policy.name}</div>
        <div className="text-xs text-slate-500">{policy.username}</div>
      </td>
      <td className="px-3 py-2">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
      <td className="px-3 py-2 text-sm text-slate-600">{formatTime(policy.next_run_at)}</td>
      <td className="px-3 py-2 text-sm text-slate-600">
        {policy.last_run ? formatTime(policy.last_run.ended_at ?? policy.last_run.started_at) : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-2">
          {policy.is_running ? (
            <>
              <Button variant="secondary" onClick={onOpenActiveRun}>View</Button>
              <Button variant="danger" onClick={onStop}>Stop</Button>
            </>
          ) : (
            <Button onClick={onRun} disabled={!policy.has_password}>Run</Button>
          )}
          <Button variant="secondary" onClick={onHistory}>History</Button>
          <Button variant="secondary" onClick={onEdit}>Edit</Button>
          <Button variant="ghost" onClick={onDelete}>Delete</Button>
        </div>
      </td>
    </tr>
  );
}
