import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditPolicyModal } from "@/components/EditPolicyModal";
import { LogViewerModal } from "@/components/LogViewerModal";
import { PolicyList } from "@/components/PolicyList";
import { RunDetailModal } from "@/components/RunDetailModal";
import { RunHistoryModal } from "@/components/RunHistoryModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ToastStack } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api/client";
import { useLogout } from "@/hooks/useAuth";
import { useDeletePolicy, usePolicies, usePoliciesLiveUpdate } from "@/hooks/usePolicies";
import { useStartRun, useStopRun } from "@/hooks/useRuns";
import { pushError, pushSuccess } from "@/store/toastStore";
import type { PolicyView, RunSummary } from "@/types/api";

export function App() {
  return (
    <AuthGate>
      <Home />
      <ToastStack />
    </AuthGate>
  );
}

function Home() {
  usePoliciesLiveUpdate(true);
  const { data: policies, isLoading } = usePolicies();
  const logout = useLogout();
  const startRun = useStartRun();
  const stopRun = useStopRun();
  const deletePolicy = useDeletePolicy();

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PolicyView | null>(null);

  const [runModal, setRunModal] = useState<{ runId: string; policyName: string } | null>(null);

  const [historyPolicy, setHistoryPolicy] = useState<PolicyView | null>(null);
  const [logRunId, setLogRunId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<PolicyView | null>(null);
  const [confirmStop, setConfirmStop] = useState<{ runId: string; policyName: string } | null>(null);

  const runPolicy = async (p: PolicyView) => {
    try {
      const result = await startRun.mutateAsync(p.name);
      setRunModal({ runId: result.run_id, policyName: p.name });
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    }
  };

  const openActiveRun = (p: PolicyView) => {
    if (p.last_run?.run_id) {
      setRunModal({ runId: p.last_run.run_id, policyName: p.name });
    }
  };

  const requestStop = (p: PolicyView) => {
    if (p.last_run?.run_id) {
      setConfirmStop({ runId: p.last_run.run_id, policyName: p.name });
    }
  };

  const doStop = async () => {
    if (!confirmStop) return;
    try {
      await stopRun.mutateAsync(confirmStop.runId);
      pushSuccess("Run stopped");
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    } finally {
      setConfirmStop(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deletePolicy.mutateAsync(confirmDelete.name);
      pushSuccess("Policy deleted");
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    } finally {
      setConfirmDelete(null);
    }
  };

  const openHistoryLog = (run: RunSummary) => setLogRunId(run.run_id);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold">icloudpd-web</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>Settings</Button>
          <Button variant="ghost" onClick={() => logout.mutate()}>Sign out</Button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4">
        {isLoading ? (
          <div className="text-slate-500">Loading…</div>
        ) : (
          <PolicyList
            policies={policies ?? []}
            onCreate={() => {
              setEditTarget(null);
              setEditOpen(true);
            }}
            onRun={runPolicy}
            onStop={requestStop}
            onEdit={(p) => {
              setEditTarget(p);
              setEditOpen(true);
            }}
            onDelete={(p) => setConfirmDelete(p)}
            onHistory={(p) => setHistoryPolicy(p)}
            onOpenActiveRun={openActiveRun}
          />
        )}
      </main>

      <EditPolicyModal open={editOpen} onClose={() => setEditOpen(false)} initial={editTarget} />
      <RunDetailModal
        open={runModal !== null}
        onClose={() => setRunModal(null)}
        runId={runModal?.runId ?? null}
        policyName={runModal?.policyName ?? null}
      />
      <RunHistoryModal
        open={historyPolicy !== null}
        onClose={() => setHistoryPolicy(null)}
        policyName={historyPolicy?.name ?? null}
        onViewLog={openHistoryLog}
      />
      <LogViewerModal open={logRunId !== null} onClose={() => setLogRunId(null)} runId={logRunId} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete policy?"
        message={`This will remove policy "${confirmDelete?.name}" and its stored password. Run history is preserved.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={confirmStop !== null}
        title="Stop run?"
        message={`Stop the running job for "${confirmStop?.policyName}"? In-flight downloads may be incomplete.`}
        confirmLabel="Stop"
        confirmVariant="danger"
        onClose={() => setConfirmStop(null)}
        onConfirm={doStop}
      />
    </div>
  );
}
