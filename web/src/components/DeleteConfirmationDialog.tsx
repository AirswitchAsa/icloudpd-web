import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Button,
} from "@chakra-ui/react";
import { useRef } from "react";
import { ApiError } from "@/api/client";
import { useDeletePolicy } from "@/hooks/usePolicies";
import { pushError, pushSuccess } from "@/store/toastStore";

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  policyName: string;
}

export function DeleteConfirmationDialog({
  isOpen,
  onClose,
  policyName,
}: DeleteConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deletePolicy = useDeletePolicy();

  const handleConfirmDelete = async () => {
    try {
      await deletePolicy.mutateAsync(policyName);
      pushSuccess(`Policy "${policyName}" deleted`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    }
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
              isLoading={deletePolicy.isPending}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
