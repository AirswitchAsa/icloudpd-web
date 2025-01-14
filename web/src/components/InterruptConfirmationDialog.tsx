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

interface InterruptConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  policyName: string;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
}

export const InterruptConfirmationDialog = ({
  isOpen,
  onClose,
  policyName,
  socket,
  toast,
}: InterruptConfirmationDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleConfirmInterrupt = () => {
    if (!socket) return;
    socket.off("error_interrupting_download");
    socket.once("error_interrupting_download", (policy_name, error) => {
      toast({
        title: "Error",
        description: `Failed to interrupt download for ${policy_name}: ${error}`,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    });
    socket.emit("interrupt", policyName);
    onClose();
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
            Interrupt Download
          </AlertDialogHeader>

          <AlertDialogBody>
            Are you sure you want to interrupt the policy {policyName}? All
            downloaded files will be kept.
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={handleConfirmInterrupt} ml={3}>
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};
