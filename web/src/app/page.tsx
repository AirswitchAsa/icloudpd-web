'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Button,
  VStack,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { EditPolicyModal } from '@/components/EditPolicyModal';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { Banner } from '@/components/Banner';
import { Panel } from '@/components/Panel';
import { PolicyList } from '@/components/PolicyList';
import { useSocket } from '@/hooks/useSocket';
import { useSocketEvents } from '@/hooks/useSocketEvents';
import { Policy } from '@/types/index';

export default function Home() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | undefined>();
  const [policyToDelete, setPolicyToDelete] = useState<Policy | undefined>();
  const { isOpen: isEditPolicyOpen, onOpen: onEditPolicyOpen, onClose: onEditPolicyClose } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose
  } = useDisclosure();
  const socket = useSocket();
  const toast = useToast();

  // Use the socket events hook
  useSocketEvents({ socket, toast, setPolicies });

  const handlePolicySaved = (newPolicy: Policy) => {
    setPolicies(prev => {
      // If we're editing, replace the old policy
      if (selectedPolicy) {
        return prev.map(p => p.name === selectedPolicy.name ? newPolicy : p);
      }
      // Otherwise add the new policy
      return [...prev, newPolicy];
    });
    handleModalClose();
  };

  const handleModalClose = () => {
    setSelectedPolicy(undefined);
    onEditPolicyClose();
  };

  const handlePolicyEdit = (policy: Policy) => {
    setSelectedPolicy(policy);
    onEditPolicyOpen();
  };

  const handleAddNewClick = () => {
    setSelectedPolicy(undefined);
    onEditPolicyOpen();
  };

  const handlePolicyDelete = (policy: Policy) => {
    setPolicyToDelete(policy);
    onDeleteOpen();
  };

  const confirmDelete = () => {
    if (!policyToDelete) return;

    try {
      socket?.emit('deletePolicy', policyToDelete.name);
      toast({
        title: 'Policy deleted',
        description: `Successfully deleted policy: ${policyToDelete.name}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setPolicyToDelete(undefined);
    } catch (error) {
      toast({
        title: 'Error deleting policy',
        description: 'Failed to delete policy',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handlePolicyRun = (policy: Policy) => {
    // TODO: Implement policy running
    console.log('Run policy:', policy);
  };

  return (
    <Box bg="gray.200" minH="100vh">
      <Banner />

      {/* Main Content */}
      <Container maxW="container.xl" py={8}>
        <VStack spacing={8} align="center" width="100%">
          {/* All Policies Panel */}
          <Box width="100%">
            <Panel
              title="All Policies"
              headerRight={
                <Button
                  bg="black"
                  color="white"
                  _hover={{ bg: 'gray.800' }}
                  borderRadius="xl"
                  fontFamily="Inter, sans-serif"
                  fontSize="12px"
                  size="sm"
                  px={4}
                  onClick={handleAddNewClick}
                >
                  Add
                </Button>
              }
            >
              <PolicyList
                policies={policies}
                onEdit={handlePolicyEdit}
                onDelete={handlePolicyDelete}
                onRun={handlePolicyRun}
              />
            </Panel>
          </Box>
        </VStack>

        {isEditPolicyOpen && (
          <EditPolicyModal
            isOpen={true}
            onClose={handleModalClose}
            onPolicySaved={handlePolicySaved}
            isEditing={!!selectedPolicy}
            policy={selectedPolicy}
          />
        )}

        <DeleteConfirmationDialog
          isOpen={isDeleteOpen}
          onClose={onDeleteClose}
          onConfirm={confirmDelete}
          policyName={policyToDelete?.name || ''}
        />
      </Container>
    </Box>
  );
}
