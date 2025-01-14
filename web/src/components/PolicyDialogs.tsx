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

  const handleConfirmDelete = () => {
    if (!socket) return;

    socket.once("policies_after_delete", (policies: Policy[]) => {
      setPolicies(policies);
      toast({
        title: "Success",
        description: `Policy: "${policy.name}" deleted successfully`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      dialogs.delete.onClose();
    });

    socket.once(
      "error_deleting_policy",
      (policy_name: string, error: string) => {
        toast({
          title: "Error",
          description: `Failed to delete policy "${policy_name}": ${error}`,
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      },
    );

    socket.emit("delete_policy", policy.name);
    dialogs.delete.onClose();
  };

  const handleConfirmInterrupt = () => {
    if (!socket) return;
    socket.emit("interrupt", policy.name);
    dialogs.interrupt.onClose();
  };

  const handleConfirmCancel = () => {
    if (!socket) return;
    socket.once("cancelled_scheduled_run", () => {
      toast({
        title: "Scheduled run cancelled",
        description: `Scheduled run for ${policy.name} has been cancelled`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    });
    socket.once("error_cancelling_scheduled_run", (policy_name, error) => {
      toast({
        title: "Error",
        description: `Failed to cancel scheduled run for ${policy_name}: ${error}`,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });
    socket.emit("cancel_scheduled_run", policy.name);
    dialogs.cancel.onClose();
  };

  return (
    <>
      {dialogs.delete.isOpen && (
        <DeleteConfirmationDialog
          isOpen={dialogs.delete.isOpen}
          onClose={dialogs.delete.onClose}
          onConfirm={handleConfirmDelete}
          policyName={policy.name}
        />
      )}

      {dialogs.cancel.isOpen && (
        <CancelConfirmationDialog
          isOpen={dialogs.cancel.isOpen}
          onClose={dialogs.cancel.onClose}
          onConfirm={handleConfirmCancel}
          policyName={policy.name}
        />
      )}

      {dialogs.interrupt.isOpen && (
        <InterruptConfirmationDialog
          isOpen={dialogs.interrupt.isOpen}
          onClose={dialogs.interrupt.onClose}
          onConfirm={handleConfirmInterrupt}
          policyName={policy.name}
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
