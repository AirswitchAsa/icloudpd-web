import { useState } from 'react';
import {
  Box,
  VStack,
  Text,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  IconButton,
  Button,
  useToast,
  FormErrorMessage,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { Socket } from 'socket.io-client';

interface UserSettingsProps {
  socket: Socket | null;
}

export function UserSettings({ socket }: UserSettingsProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const toast = useToast();

  const passwordsMatch = newPassword === confirmPassword;
  const showMismatchError = confirmPassword !== '' && !passwordsMatch;

  const handleSave = () => {
    if (!socket || !passwordsMatch) return;
    setIsSaving(true);

    socket.emit('save_secret', oldPassword, newPassword);
  };

  // Set up socket event listeners
  socket?.once('server_secret_saved', () => {
    setIsSaving(false);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast({
      title: 'Success',
      description: 'Server password has been updated',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  });

  socket?.once('failed_saving_server_secret', (data: { error: string }) => {
    setIsSaving(false);
    toast({
      title: 'Error',
      description: data.error,
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  });

  return (
    <Box>
      <VStack spacing={8} align="stretch">
        <Box>
          <Text fontWeight="bold" fontSize="lg" mb={4}>Local Server</Text>
          <VStack spacing={3} align="stretch" maxW="400px">
            <FormControl>
              <FormLabel fontSize="sm">Current Password</FormLabel>
              <InputGroup size="sm">
                <Input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={showOldPassword ? 'Hide password' : 'Show password'}
                    icon={showOldPassword ? <ViewOffIcon /> : <ViewIcon />}
                    variant="ghost"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    size="sm"
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
            <FormControl isInvalid={showMismatchError}>
              <FormLabel fontSize="sm">New Password</FormLabel>
              <InputGroup size="sm">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
              <FormLabel fontSize="sm">Confirm New Password</FormLabel>
              <InputGroup size="sm">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
            <Box pt={2}>
              <Button
                bg="black"
                color="white"
                _hover={{ bg: 'gray.800' }}
                onClick={handleSave}
                isDisabled={!oldPassword || !newPassword || !confirmPassword || !passwordsMatch || isSaving}
                isLoading={isSaving}
                size="sm"
              >
                Update Password
              </Button>
            </Box>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
} 