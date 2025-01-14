import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Button,
  UseToastOptions,
} from "@chakra-ui/react";
import { useRef } from "react";
import { Socket } from "socket.io-client";
import { Policy } from "@/types";
interface CancelConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  policyName: string;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
  setPolicies: (policies: Policy[]) => void;
}

export const CancelConfirmationDialog = ({
  isOpen,
  onClose,
  policyName,
  socket,
  toast,
  setPolicies,
}: CancelConfirmationDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleConfirmCancel = () => {
    if (!socket) return;
    socket.off("policies_after_cancel");
    socket.off("error_cancelling_scheduled_run");
    socket.once("policies_after_cancel", (policies) => {
      toast({
        title: "Scheduled run cancelled",
        description: `Scheduled run for ${policyName} has been cancelled`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      setPolicies(policies);
      onClose();
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
    socket.emit("cancel_scheduled_run", policyName);
  };

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            Cancel Scheduled Run
          </AlertDialogHeader>

          <AlertDialogBody>
            Are you sure you want to cancel the scheduled run for policy{" "}
            {policyName}? All downloaded files will be kept.
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={handleConfirmCancel} ml={3}>
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};
