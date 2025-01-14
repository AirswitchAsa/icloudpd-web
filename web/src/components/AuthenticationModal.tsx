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
  InputGroup,
  InputRightElement,
  IconButton,
  Flex,
  Text,
  VStack,
  UseToastOptions,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { Socket } from "socket.io-client";

interface AuthenticationModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  socket: Socket | null;
  error?: string;
  setAuthError: (error?: string) => void;
  toast: (options: UseToastOptions) => void;
  policy_name: string;
  onMfaRequired: () => void;
}

export function AuthenticationModal({
  isOpen,
  onClose,
  username,
  socket,
  error,
  setAuthError,
  toast,
  policy_name,
  onMfaRequired,
}: AuthenticationModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSubmit = () => {
    if (!socket) return;
    setIsAuthenticating(true);

    socket.once("authenticated", () => {
      setIsAuthenticating(false);
      toast({
        title: "Success",
        description: `Policy: "${policy_name}" authenticated successfully`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      setAuthError(undefined);
      onClose();
    });

    socket.once(
      "authentication_failed",
      (data: { error: string; policy_name: string }) => {
        setIsAuthenticating(false);
        setAuthError(data.error);
        toast({
          title: "Error",
          description: `Failed to authenticate policy "${data.policy_name}": ${data.error}`,
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      },
    );

    socket.once(
      "mfa_required",
      (data: { error: string; policy_name: string }) => {
        setIsAuthenticating(false);
        toast({
          title: "MFA required",
          description: `MFA required to authenticate policy "${data.policy_name}"`,
          status: "info",
          duration: 3000,
          isClosable: true,
        });
        onClose();
        onMfaRequired();
      },
    );

    socket.emit("authenticate", policy_name, password);
    setPassword("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl">
        <ModalHeader>Authentication Required</ModalHeader>
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>
                {isAuthenticating ? (
                  <Flex gap={2} align="center">
                    <Text>Authenticating...</Text>
                  </Flex>
                ) : (
                  `Enter the password for iCloud user ${username}`
                )}
              </FormLabel>
              <InputGroup>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && password) {
                      handleSubmit();
                    }
                  }}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                    variant="ghost"
                    onClick={() => setShowPassword(!showPassword)}
                    size="sm"
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
            {error && (
              <Text color="red.500" fontSize="sm">
                {error}
              </Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleSubmit}
            isDisabled={!password || isAuthenticating}
            isLoading={isAuthenticating}
          >
            Submit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
