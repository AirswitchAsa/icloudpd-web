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

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  policyName: string;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
  setPolicies: (policies: Policy[]) => void;
}

export function DeleteConfirmationDialog({
  isOpen,
  onClose,
  policyName,
  socket,
  toast,
  setPolicies,
}: DeleteConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleConfirmDelete = () => {
    if (!socket) return;
    socket.off("policies_after_delete");
    socket.off("error_deleting_policy");

    socket.once("policies_after_delete", (policies: Policy[]) => {
      setPolicies(policies);
      toast({
        title: "Success",
        description: `Policy: "${policyName}" deleted successfully`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      onClose();
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

    socket.emit("delete_policy", policyName);
  };

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
    >
      <AlertDialogOverlay>
        <AlertDialogContent borderRadius="xl">
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            Delete Policy
          </AlertDialogHeader>

          <AlertDialogBody>
            {`Are you sure you want to delete policy "${policyName}"? This action cannot be undone.`}
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onClose} borderRadius="xl">
              Cancel
            </Button>
            <Button
              colorScheme="red"
              onClick={handleConfirmDelete}
              ml={3}
              borderRadius="xl"
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
