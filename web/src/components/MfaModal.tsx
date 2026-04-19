import { useState } from "react";
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
import { pushError, pushSuccess } from "@/store/toastStore";

interface MFAModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyName: string;
}

export function MFAModal({ isOpen, onClose, policyName }: MFAModalProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = async () => {
    setIsVerifying(true);
    setError(undefined);
    try {
      await mfaApi.submit(policyName, code);
      pushSuccess("MFA code submitted");
      setCode("");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        pushError(err.message, err.errorId);
      } else {
        setError("Failed to submit MFA code");
      }
    } finally {
      setIsVerifying(false);
    }
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
