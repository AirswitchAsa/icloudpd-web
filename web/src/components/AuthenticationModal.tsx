import { useState } from 'react';
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
  Spinner,
  Flex,
  Text,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { Socket } from 'socket.io-client';

interface AuthenticationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
  username: string;
  socket: Socket | null;
}

export function AuthenticationModal({ isOpen, onClose, onSubmit, username, socket }: AuthenticationModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSubmit = () => {
    if (!socket) return;
    setIsAuthenticating(true);

    // Add one-time listeners for authentication response
    socket.once('authenticated', () => {
      setIsAuthenticating(false);
      onClose();
    });

    socket.once('authentication_failed', () => {
      setIsAuthenticating(false);
    });

    onSubmit(password);
    setPassword('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl">
        <ModalHeader>Authentication Required</ModalHeader>
        <ModalBody>
          <FormControl>
            <FormLabel>
              {isAuthenticating ? (
                <Flex gap={2} align="center">
                  <Spinner size="sm" />
                  <Text>Authenticating</Text>
                </Flex>
              ) : (
                `Enter the password for iCloud user ${username}`
              )}
            </FormLabel>
            <InputGroup>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password) {
                    handleSubmit();
                  }
                }}
              />
              <InputRightElement>
                <IconButton
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                  variant="ghost"
                  onClick={() => setShowPassword(!showPassword)}
                  size="sm"
                />
              </InputRightElement>
            </InputGroup>
          </FormControl>
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