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
} from '@chakra-ui/react';

interface CreatePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePolicyModal({ isOpen, onClose }: CreatePolicyModalProps) {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="full"
    >
      <ModalOverlay />
      <ModalContent
        maxW="30%"
        h="80vh"
        my="auto"
        bg="white"
        position="fixed"
        top="10%"
        left="35%"
        borderRadius="2xl"
        overflow="hidden"
      >
        <ModalHeader fontFamily="Inter, sans-serif" >New Policy</ModalHeader>
        <ModalBody pb={6} overflowY="auto">
          <VStack spacing={4}>
            <FormControl>
              <FormLabel fontFamily="Inter, sans-serif">Policy Name</FormLabel>
              <Input placeholder="Enter policy name" />
            </FormControl>

            <FormControl>
              <FormLabel fontFamily="Inter, sans-serif">iCloud Account</FormLabel>
              <Select placeholder="Select account">
                <option>account1@icloud.com</option>
                <option>account2@icloud.com</option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontFamily="Inter, sans-serif">Album</FormLabel>
              <Select placeholder="Select album">
                <option>All Photos</option>
                <option>Favorites</option>
                <option>Recents</option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontFamily="Inter, sans-serif">Download Location</FormLabel>
              <Input placeholder="Select folder location" />
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
          >
            Create Policy
          </Button>
          <Button onClick={onClose} borderRadius="xl" fontFamily="Inter, sans-serif">Cancel</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
} 