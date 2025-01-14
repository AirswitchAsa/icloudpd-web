import { useState } from "react";
import { Socket } from "socket.io-client";
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
  UseToastOptions,
} from "@chakra-ui/react";

interface MFAModalProps {
  isOpen: boolean;
  onClose: () => void;
  error?: string;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
  setMfaError: (error?: string) => void;
  policy_name: string;
}

export function MFAModal({
  isOpen,
  onClose,
  error,
  socket,
  toast,
  setMfaError,
  policy_name,
}: MFAModalProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = () => {
    if (!socket) return;
    setIsVerifying(true);
    // Remove existing listeners
    socket.off("authenticated");
    socket.off("authentication_failed");
    socket.off("mfa_required");

    socket.once("authenticated", () => {
      setIsVerifying(false);
      toast({
        title: "Success",
        description: `MFA code verified successfully`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      setMfaError(undefined);
      onClose();
    });
    socket.once(
      "authentication_failed",
      (data: { error: string; policy_name: string }) => {
        toast({
          title: "Error",
          description: `Failed to authenticate policy "${data.policy_name}": ${data.error}`,
          status: "error",
          duration: 3000,
          isClosable: true,
        });
        setMfaError(data.error);
        setIsVerifying(false);
      },
    );
    socket.once(
      "mfa_required",
      (data: { error: string; policy_name: string }) => {
        toast({
          title: "MFA Required",
          description: `MFA verification failed: ${data.error}`,
          status: "info",
          duration: 3000,
          isClosable: true,
        });
        setMfaError(data.error);
        setIsVerifying(false);
      },
    );

    socket.emit("provide_mfa", policy_name, code);
    setCode("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl">
        <ModalHeader>Two-Factor Authentication</ModalHeader>
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>
                {isVerifying ? (
                  <Flex gap={2} align="center">
                    <Text>Verifying...</Text>
                  </Flex>
                ) : (
                  `Verification code is sent to your trusted devices`
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
                placeholder="Enter code"
                isDisabled={isVerifying}
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
            onClick={onClose}
            isDisabled={isVerifying}
          >
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleSubmit}
            isDisabled={!code || isVerifying}
            isLoading={isVerifying}
          >
            Submit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
