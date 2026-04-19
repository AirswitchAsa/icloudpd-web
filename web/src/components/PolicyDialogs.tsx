import { lazy, Suspense } from "react";
import type { PolicyView } from "@/types/api";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { InterruptConfirmationDialog } from "./InterruptConfirmationDialog";

const MFAModal = lazy(() =>
  import("./MfaModal").then((m) => ({ default: m.MFAModal }))
);
const EditPolicyModal = lazy(() =>
  import("./EditPolicyModal").then((m) => ({ default: m.EditPolicyModal }))
);

interface PolicyDialogsProps {
  policy: PolicyView;
  onInterruptConfirmed: () => void;
  dialogs: {
    delete: { isOpen: boolean; onClose: () => void };
    interrupt: { isOpen: boolean; onClose: () => void };
    mfa: {
      isOpen: boolean;
      onClose: () => void;
      onOpen: () => void;
    };
    edit: { isOpen: boolean; onClose: () => void };
  };
}

export function PolicyDialogs({
  policy,
  onInterruptConfirmed,
  dialogs,
}: PolicyDialogsProps) {
  return (
    <>
      {dialogs.delete.isOpen && (
        <DeleteConfirmationDialog
          isOpen={dialogs.delete.isOpen}
          onClose={dialogs.delete.onClose}
          policyName={policy.name}
        />
      )}

      {dialogs.interrupt.isOpen && (
        <InterruptConfirmationDialog
          isOpen={dialogs.interrupt.isOpen}
          onClose={dialogs.interrupt.onClose}
          policyName={policy.name}
          onConfirm={onInterruptConfirmed}
        />
      )}

      <Suspense fallback={null}>
        {dialogs.mfa.isOpen && (
          <MFAModal
            isOpen={dialogs.mfa.isOpen}
            onClose={dialogs.mfa.onClose}
            policyName={policy.name}
          />
        )}

        {dialogs.edit.isOpen && (
          <EditPolicyModal
            isOpen={dialogs.edit.isOpen}
            onClose={dialogs.edit.onClose}
            isEditing={true}
            policy={policy}
          />
        )}
      </Suspense>
    </>
  );
}
