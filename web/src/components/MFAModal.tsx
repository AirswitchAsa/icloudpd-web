import { useState } from 'react';
import { Socket } from 'socket.io-client';
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
  Spinner,
} from '@chakra-ui/react';

interface MFAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
  error?: string;
  socket: Socket | null;
}

export function MFAModal({ isOpen, onClose, onSubmit, error, socket }: MFAModalProps) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = () => {
    if (!socket) return;
    
    setIsVerifying(true);

    socket.once('authenticated', () => {
      setIsVerifying(false);
      onClose();
    });

    socket.once('authentication_failed', () => {
      setIsVerifying(false);
    });

    socket.once('mfa_required', () => {
      setIsVerifying(false);
    });

    onSubmit(code);
    setCode('');
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
                    <Spinner size="sm" />
                    <Text>Verifying</Text>
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
                  if (e.key === 'Enter' && code) {
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
          <Button variant="ghost" mr={3} onClick={onClose} isDisabled={isVerifying}>
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