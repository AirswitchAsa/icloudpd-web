import { useState, useEffect } from 'react';
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
  Switch,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { Socket } from 'socket.io-client';

interface UserSettingsProps {
  socket: Socket | null;
  isGuest: boolean;
}

interface AccessControlConfig {
  no_password: boolean;
  always_guest: boolean;
  disable_guest: boolean;
}

export function UserSettings({ socket, isGuest }: UserSettingsProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [accessControl, setAccessControl] = useState<AccessControlConfig>({
    no_password: false,
    always_guest: false,
    disable_guest: false,
  });
  const toast = useToast();

  const passwordsMatch = newPassword === confirmPassword;
  const showMismatchError = confirmPassword !== '' && !passwordsMatch;

  useEffect(() => {
    if (!socket) return;

    // Get server config
    socket.emit('getServerConfig');

    socket.on('server_config', (config: AccessControlConfig) => {
      setAccessControl(config);
    });

    return () => {
      socket.off('server_config');
    };
  }, [socket]);

  const handleSave = () => {
    if (!socket || !passwordsMatch) return;
    setIsSaving(true);

    // Set up listeners before emitting
    socket.once('server_secret_saved', () => {
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

    socket.once('failed_saving_server_secret', (data: { error: string }) => {
      setIsSaving(false);
      toast({
        title: 'Error',
        description: data.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    });

    socket.emit('save_secret', oldPassword, newPassword);
  };

  const handleConfigChange = (key: keyof AccessControlConfig) => (value: boolean) => {
    if (!socket) return;

    // Set up listeners before emitting
    socket.once('app_config_updated', () => {
      // Update local state immediately after successful update
      setAccessControl(prev => ({
        ...prev,
        [key]: value
      }));
      
      toast({
        title: 'Success',
        description: 'Access control settings updated',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    });

    socket.once('error_updating_app_config', (data: { error: string }) => {
      // Revert the switch back to its previous state by re-fetching config
      socket.emit('getServerConfig');
      
      toast({
        title: 'Error',
        description: data.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    });

    socket.emit('updateAppConfig', key, value);
  };

  return (
    <Box>
      <VStack spacing={8} align="stretch">
        <Box>
          <Text fontWeight="bold" fontSize="lg" mb={4}>Change Password</Text>
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
                isDisabled={!oldPassword || !newPassword || !confirmPassword || !passwordsMatch || isSaving || isGuest}
                isLoading={isSaving}
                size="sm"
              >
                Update Password
              </Button>
            </Box>
          </VStack>
        </Box>

        <Box>
          <Text fontWeight="bold" fontSize="lg" mb={4}>Access Control</Text>
          <VStack spacing={3} align="stretch" maxW="400px">
            <FormControl>
              <FormLabel fontSize="sm">No Password Required</FormLabel>
              <Switch
                isChecked={accessControl.no_password}
                onChange={(e) => handleConfigChange('no_password')(e.target.checked)}
                isDisabled={isGuest}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Always Use Guest Mode</FormLabel>
              <Switch
                isChecked={accessControl.always_guest}
                onChange={(e) => handleConfigChange('always_guest')(e.target.checked)}
                isDisabled={isGuest && !accessControl.always_guest}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Disable Guest Access</FormLabel>
              <Switch
                isChecked={accessControl.disable_guest}
                onChange={(e) => handleConfigChange('disable_guest')(e.target.checked)}
                isDisabled={isGuest}
              />
            </FormControl>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
} 