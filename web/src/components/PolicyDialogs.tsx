import { UseToastOptions } from "@chakra-ui/react";
import { Socket } from "socket.io-client";
import { Policy } from "@/types";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { CancelConfirmationDialog } from "./CancelConfirmationDialog";
import { InterruptConfirmationDialog } from "./InterruptConfirmationDialog";
import { AuthenticationModal } from "./AuthenticationModal";
import { MFAModal } from "./MFAModal";
import { EditPolicyModal } from "./EditPolicyModal";
import { useState } from "react";

interface PolicyDialogsProps {
  policy: Policy;
  setPolicies: (policies: Policy[]) => void;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
  dialogs: {
    delete: { isOpen: boolean; onClose: () => void };
    cancel: { isOpen: boolean; onClose: () => void };
    interrupt: { isOpen: boolean; onClose: () => void };
    auth: {
      isOpen: boolean;
      onClose: () => void;
    };
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
  setPolicies,
  socket,
  toast,
  dialogs,
}: PolicyDialogsProps) {
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const [mfaError, setMfaError] = useState<string | undefined>(undefined);

  return (
    <>
      {dialogs.delete.isOpen && (
        <DeleteConfirmationDialog
          isOpen={dialogs.delete.isOpen}
          onClose={dialogs.delete.onClose}
          policyName={policy.name}
          socket={socket}
          toast={toast}
          setPolicies={setPolicies}
        />
      )}

      {dialogs.cancel.isOpen && (
        <CancelConfirmationDialog
          isOpen={dialogs.cancel.isOpen}
          onClose={dialogs.cancel.onClose}
          policyName={policy.name}
          socket={socket}
          toast={toast}
          setPolicies={setPolicies}
        />
      )}

      {dialogs.interrupt.isOpen && (
        <InterruptConfirmationDialog
          isOpen={dialogs.interrupt.isOpen}
          onClose={dialogs.interrupt.onClose}
          policyName={policy.name}
          socket={socket}
          toast={toast}
        />
      )}

      {dialogs.auth.isOpen && (
        <AuthenticationModal
          isOpen={dialogs.auth.isOpen}
          onClose={() => {
            setAuthError(undefined);
            dialogs.auth.onClose();
          }}
          username={policy.username}
          socket={socket}
          error={authError}
          setAuthError={setAuthError}
          toast={toast}
          policy_name={policy.name}
          onMfaRequired={dialogs.mfa.onOpen}
          setPolicies={setPolicies}
        />
      )}

      {dialogs.mfa.isOpen && (
        <MFAModal
          isOpen={dialogs.mfa.isOpen}
          onClose={() => {
            setMfaError(undefined);
            dialogs.mfa.onClose();
          }}
          socket={socket}
          toast={toast}
          error={mfaError}
          setMfaError={setMfaError}
          policy_name={policy.name}
          setPolicies={setPolicies}
        />
      )}

      {dialogs.edit.isOpen && (
        <EditPolicyModal
          isOpen={dialogs.edit.isOpen}
          onClose={dialogs.edit.onClose}
          setPolicies={setPolicies}
          isEditing={true}
          policy={policy}
          socket={socket}
        />
      )}
    </>
  );
}
