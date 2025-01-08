import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Text,
} from '@chakra-ui/react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: () => void;
}

export const ImportModal = ({ isOpen, onClose, onImport }: ImportModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Import Policies</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text>Select a TOML file containing policy definitions to import.</Text>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" onClick={onImport}>
            Choose File
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => void;
}

export const ExportModal = ({ isOpen, onClose, onExport }: ExportModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Export Policies</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text>Download your policies as a TOML file.</Text>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" onClick={onExport}>
            Download
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}; 