import { useState, useEffect } from 'react';
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
  Link,
  useDisclosure,
  FormErrorMessage,
  HStack,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { Socket } from 'socket.io-client';
import { generateGuestId } from '@/hooks/useSocket';

interface ServerAuthenticationModalProps {
  isOpen: boolean;
  socket: Socket | null;
  onAuthenticated: (clientId: string, isGuest: boolean) => void;
}

interface ServerConfig {
  no_password: boolean;
  always_guest: boolean;
  disable_guest: boolean;
}

export function ServerAuthenticationModal({ isOpen, socket, onAuthenticated }: ServerAuthenticationModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSettingNewPassword, setIsSettingNewPassword] = useState(false);
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    no_password: false,
    always_guest: false,
    disable_guest: false,
  });
  const { isOpen: isNewPasswordOpen, onOpen: onNewPasswordOpen, onClose: onNewPasswordClose } = useDisclosure();

  const passwordsMatch = newPassword === confirmPassword;
  const showMismatchError = confirmPassword !== '' && !passwordsMatch;

  useEffect(() => {
    if (!socket) return;

    // Get server config
    socket.emit('getServerConfig');

    socket.on('server_config', (config: ServerConfig) => {
      setServerConfig(config);
    });

    return () => {
      socket.off('server_config');
    };
  }, [socket, onAuthenticated]);

  useEffect(() => {
    if (serverConfig.no_password) {
      onAuthenticated('default-user', false);
    } else if (serverConfig.always_guest) {
      onAuthenticated(generateGuestId(), true);
    }
  }, [serverConfig, onAuthenticated]);

  const handleSubmit = () => {
    if (!socket) return;
    setIsAuthenticating(true);
    setError(undefined);

    socket.emit('authenticate_local', password);
  };

  const handleGuestLogin = () => {
    if (!socket) return;
    // Listen for logout completion until login the guest
    socket.once('logout_complete', () => {
      const guestId = generateGuestId();
      onAuthenticated(guestId, true);
    });
    socket.emit('logOut', 'default-user');
  };

  const handleSetNewPassword = () => {
    if (!socket || !passwordsMatch) return;
    setIsSettingNewPassword(true);
    setError(undefined);

    socket.once('server_secret_reset', () => {
      setPassword('');
    });
    socket.once('failed_resetting_server_secret', (data: { error: string }) => {
      setError(data.error);
    });
    socket.emit('reset_secret');
    socket.emit('save_secret', '', newPassword);
  };

  // Set up socket event listeners
  socket?.once('server_authenticated', () => {
    setIsAuthenticating(false);
    setPassword('');
    onAuthenticated('default-user', false);
  });

  socket?.once('server_authentication_failed', (data: { error: string }) => {
    setIsAuthenticating(false);
    setError(data.error);
  });

  socket?.once('server_secret_reset', () => {
    setPassword('');
  });

  socket?.once('failed_resetting_server_secret', (data: { error: string }) => {
    setError(data.error);
  });

  socket?.once('server_secret_saved', () => {
    setIsSettingNewPassword(false);
    setNewPassword('');
    setConfirmPassword('');
    onNewPasswordClose();
  });

  socket?.once('failed_saving_server_secret', (data: { error: string }) => {
    setIsSettingNewPassword(false);
    setError(data.error);
  });

  return (
    <>
      <Modal isOpen={isOpen} onClose={() => {}} isCentered closeOnOverlayClick={false} closeOnEsc={false}>
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent borderRadius="xl">
          <ModalHeader>Server Authentication</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <FormControl>
                <FormLabel>
                  {isAuthenticating ? 'Authenticating...' : 'Enter server password'}
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
              {error && (
                <Text color="red.500" fontSize="sm" alignSelf="flex-start" py={0}>
                  {error}
                </Text>
              )}
              <HStack spacing={4} width="100%" justify="space-between">
                <Link
                  color="gray.700"
                  fontSize="14px"
                  onClick={() => {
                    setError('');
                    onNewPasswordOpen();
                  }}
                  textDecoration="underline"
                  cursor="pointer"
                >
                  Reset server password
                </Link>
                {!serverConfig.disable_guest && (
                  <Link
                    color="gray.700"
                    fontSize="14px"
                    onClick={handleGuestLogin}
                    textDecoration="underline"
                    cursor="pointer"
                  >
                    Continue as guest
                  </Link>
                )}
              </HStack>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              bg="black"
              color="white"
              _hover={{ bg: 'gray.800' }}
              onClick={handleSubmit}
              isDisabled={!password || isAuthenticating}
              isLoading={isAuthenticating}
            >
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isNewPasswordOpen} onClose={() => {}} isCentered closeOnOverlayClick={false} closeOnEsc={false}>
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent borderRadius="xl">
          <ModalHeader>Set New Password</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isInvalid={showMismatchError}>
                <FormLabel>New Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newPassword && passwordsMatch) {
                        handleSetNewPassword();
                      }
                    }}
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      icon={showNewPassword ? <ViewOffIcon /> : <ViewIcon />}
                      variant="ghost"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      size="sm"
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              <FormControl isInvalid={showMismatchError}>
                <FormLabel>Confirm Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && confirmPassword && passwordsMatch) {
                        handleSetNewPassword();
                      }
                    }}
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      icon={showConfirmPassword ? <ViewOffIcon /> : <ViewIcon />}
                      variant="ghost"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      size="sm"
                    />
                  </InputRightElement>
                </InputGroup>
                {showMismatchError && (
                  <FormErrorMessage>Passwords do not match</FormErrorMessage>
                )}
              </FormControl>
              {error && (
                <Text color="red.500" fontSize="sm" alignSelf="flex-start">
                  {error}
                </Text>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              bg="black"
              color="white"
              _hover={{ bg: 'gray.800' }}
              onClick={handleSetNewPassword}
              isDisabled={!newPassword || !confirmPassword || !passwordsMatch || isSettingNewPassword}
              isLoading={isSettingNewPassword}
            >
              Set Password
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
} 