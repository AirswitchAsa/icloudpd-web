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
  Text,
  VStack,
  Box,
  Flex,
  useToast,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { Socket } from 'socket.io-client';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  socket: Socket | null;
}

export function SettingsModal({ isOpen, onClose, socket }: SettingsModalProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const toast = useToast();

  const handleSave = () => {
    if (!socket) return;
    setIsSaving(true);

    socket.emit('save_secret', oldPassword, newPassword);
  };

  // Set up socket event listeners
  socket?.once('server_secret_saved', () => {
    setIsSaving(false);
    setOldPassword('');
    setNewPassword('');
    toast({
      title: 'Success',
      description: 'Server password has been updated',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
    onClose();
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
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl">
        <ModalHeader>Settings</ModalHeader>
        <ModalBody>
          <Flex>
            <Box flex={1}>
              <VStack spacing={4} align="stretch">
                <Text fontWeight="bold" fontSize="lg">Change Server Password</Text>
                <FormControl>
                  <FormLabel>Current Password</FormLabel>
                  <InputGroup>
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
                <FormControl>
                  <FormLabel>New Password</FormLabel>
                  <InputGroup>
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
              </VStack>
            </Box>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button
            bg="black"
            color="white"
            _hover={{ bg: 'gray.800' }}
            onClick={handleSave}
            isDisabled={!oldPassword || !newPassword || isSaving}
            isLoading={isSaving}
          >
            Save Changes
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
} 