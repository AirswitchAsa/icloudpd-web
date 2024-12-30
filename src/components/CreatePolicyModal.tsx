import { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  VStack,
  Select,
  Button,
  ModalFooter,
  useToast,
} from '@chakra-ui/react';
import { Policy } from '@/server/handler';
import { useSocket } from '@/hooks/useSocket';

interface CreatePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPolicyCreated?: (policy: Policy) => void;
}

export function CreatePolicyModal({ isOpen, onClose, onPolicyCreated }: CreatePolicyModalProps) {
  const toast = useToast();
  const socket = useSocket();
  const [formData, setFormData] = useState({
    name: '',
    account: '',
    album: '',
    directory: '',
  });

  const handleSubmit = () => {
    if (!socket) {
      toast({
        title: 'Connection error',
        description: 'Not connected to server',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      socket.emit('addPolicy', formData);
      
      // Listen for the response
      socket.once('policyAdded', (newPolicy) => {
        toast({
          title: 'Policy created.',
          description: `Successfully created policy: ${formData.name}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });

        onPolicyCreated?.(newPolicy);
        onClose();
      });

      socket.once('error', (error) => {
        toast({
          title: 'Error creating policy.',
          description: error.message || 'Something went wrong while creating the policy.',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      });
    } catch (error) {
      toast({
        title: 'Error creating policy.',
        description: 'Something went wrong while creating the policy.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      isCentered
      motionPreset="slideInBottom"
    >
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent
        maxW="500px"
        w="90%"
        bg="white"
        borderRadius="2xl"
        boxShadow="xl"
      >
        <ModalHeader fontFamily="Inter, sans-serif">Create New Policy</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel fontFamily="Inter, sans-serif">Policy Name</FormLabel>
              <Input 
                placeholder="Enter policy name"
                borderRadius="xl"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontFamily="Inter, sans-serif">iCloud Account</FormLabel>
              <Input 
                placeholder="Enter iCloud email"
                borderRadius="xl"
                value={formData.account}
                onChange={(e) => setFormData({ ...formData, account: e.target.value })}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontFamily="Inter, sans-serif">Album</FormLabel>
              <Select 
                placeholder="Select album"
                borderRadius="xl"
                value={formData.album}
                onChange={(e) => setFormData({ ...formData, album: e.target.value })}
              >
                <option value="All Photos">All Photos</option>
                <option value="Favorites">Favorites</option>
                <option value="Recents">Recents</option>
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontFamily="Inter, sans-serif">Download Location</FormLabel>
              <Input 
                placeholder="Select folder location"
                borderRadius="xl"
                value={formData.directory}
                onChange={(e) => setFormData({ ...formData, directory: e.target.value })}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button
            bg="black"
            color="white"
            _hover={{ bg: 'gray.800' }}
            mr={3}
            borderRadius="xl"
            fontFamily="Inter, sans-serif"
            onClick={handleSubmit}
            isDisabled={!formData.name || !formData.account || !formData.album || !formData.directory}
          >
            Create Policy
          </Button>
          <Button 
            onClick={onClose} 
            borderRadius="xl" 
            fontFamily="Inter, sans-serif"
            variant="ghost"
            _hover={{ bg: 'gray.100' }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
} 