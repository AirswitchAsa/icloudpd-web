import { useEffect, useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  FormControl,
  FormLabel,
  Text,
  VStack,
  Flex,
} from "@chakra-ui/react";
import { ApiError } from "@/api/client";
import { mfaApi } from "@/api/mfa";
import { pushError } from "@/store/toastStore";

interface MFAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel: () => Promise<void> | void;
  policyName: string;
  /** True if the current awaiting_mfa is a re-prompt after a previous code
   * was delivered (indicating Apple rejected it). */
  rejectedPrevious: boolean;
}

export function MFAModal({
  isOpen,
  onClose,
  onCancel,
  policyName,
  rejectedPrevious,
}: MFAModalProps) {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Reset transient state each time the modal is re-opened for a new prompt.
  useEffect(() => {
    if (isOpen) {
      setCode("");
      setHasSubmitted(false);
      setError(undefined);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(undefined);
    try {
      await mfaApi.submit(policyName, code);
      setHasSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        pushError(err.message, err.errorId);
      } else {
        setError("Failed to submit MFA code");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await onCancel();
      setCode("");
      onClose();
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      isCentered
      closeOnOverlayClick={false}
      closeOnEsc={false}
    >
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl">
        <ModalHeader>Apple 2FA verification</ModalHeader>
        <ModalBody>
          <VStack spacing={4} align="stretch">
            {hasSubmitted ? (
              <Text fontSize="sm" color="gray.600">
                Code submitted — waiting for icloudpd to verify with Apple.
                This modal will close automatically on success. If Apple
                rejects the code, we&apos;ll prompt you again.
              </Text>
            ) : (
              <Text fontSize="sm" color="gray.600">
                Apple should push a 6-digit code to your trusted devices. If
                you don&apos;t receive one within a minute, Apple may be
                rate-limiting after repeated attempts — wait and try again, or
                click Cancel to abort this run.
              </Text>
            )}
            {rejectedPrevious && !hasSubmitted && (
              <Text fontSize="sm" color="red.600" fontWeight="semibold">
                The previous code was rejected. Enter a new one.
              </Text>
            )}
            <FormControl>
              <FormLabel>
                {isSubmitting ? (
                  <Flex gap={2} align="center">
                    <Text>Submitting...</Text>
                  </Flex>
                ) : hasSubmitted ? (
                  `Verifying with Apple...`
                ) : (
                  `Verification code`
                )}
              </FormLabel>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code) {
                    handleSubmit();
                  }
                }}
                placeholder="6-digit code"
                isDisabled={isSubmitting || isCancelling || hasSubmitted}
              />
            </FormControl>
            {error && (
              <Text color="red.500" fontSize="sm">
                {error}
              </Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="ghost"
            mr={3}
            onClick={handleCancel}
            isDisabled={isSubmitting}
            isLoading={isCancelling}
          >
            Cancel &amp; stop run
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleSubmit}
            isDisabled={!code || isSubmitting || isCancelling || hasSubmitted}
            isLoading={isSubmitting}
          >
            Submit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
