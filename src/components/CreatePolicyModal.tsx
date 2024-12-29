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
  Select,
  Button,
  VStack,
} from '@chakra-ui/react';
import { useSocket } from '@/hooks/useSocket';
import { CreatePolicyInput } from '@/types';

interface CreatePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePolicyModal({ isOpen, onClose }: CreatePolicyModalProps) {
  const socket = useSocket();
  const [formData, setFormData] = useState<CreatePolicyInput>({
    username: '',
    directory: '',
    syncMode: 'download',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    socket?.emit('createPolicy', formData);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create New Policy</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>iCloud Username</FormLabel>
                <Input
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Download Directory</FormLabel>
                <Input
                  value={formData.directory}
                  onChange={(e) =>
                    setFormData({ ...formData, directory: e.target.value })
                  }
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Sync Mode</FormLabel>
                <Select
                  value={formData.syncMode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      syncMode: e.target.value as 'download' | 'sync',
                    })
                  }
                >
                  <option value="download">Download Only</option>
                  <option value="sync">Sync</option>
                </Select>
              </FormControl>

              <Button type="submit" colorScheme="blue" width="100%">
                Create Policy
              </Button>
            </VStack>
          </form>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
} 