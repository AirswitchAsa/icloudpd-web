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

  const handlePolicySaved = (policies: Policy[]) => {
    setPolicies(policies);
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
    
    socket?.emit('deletePolicy', policyToDelete.name);
    onDeleteClose();
    setPolicyToDelete(undefined);
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
