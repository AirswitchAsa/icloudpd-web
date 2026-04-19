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
  Text,
  VStack,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { ApiError } from "@/api/client";
import { useLogin } from "@/hooks/useAuth";

interface ServerAuthenticationModalProps {
  isOpen: boolean;
}

export function ServerAuthenticationModal({
  isOpen,
}: ServerAuthenticationModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const login = useLogin();

  const handleSubmit = async () => {
    setError(undefined);
    try {
      await login.mutateAsync(password);
      setPassword("");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Authentication failed");
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      isCentered
      closeOnOverlayClick={false}
      closeOnEsc={false}
    >
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl">
        <ModalHeader>Server Authentication</ModalHeader>
        <ModalBody>
          <VStack spacing={4}>
            <FormControl>
              <FormLabel>
                {login.isPending
                  ? "Authenticating..."
                  : "Enter server password"}
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
              <Text
                color="red.500"
                fontSize="sm"
                alignSelf="flex-start"
                py={0}
              >
                {error}
              </Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button
            bg="black"
            color="white"
            _hover={{ bg: "gray.800" }}
            onClick={handleSubmit}
            isDisabled={!password || login.isPending}
            isLoading={login.isPending}
          >
            Submit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
