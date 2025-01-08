'use client';

import { useState, useEffect } from 'react';
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
import { AuthenticationModal } from '@/components/AuthenticationModal';
import { MFAModal } from '@/components/MFAModal';

export default function Home() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | undefined>();
  const [policyToDelete, setPolicyToDelete] = useState<Policy | undefined>();
  const [policyToAuth, setPolicyToAuth] = useState<Policy | undefined>();
  const [mfaError, setMfaError] = useState<string>();

  const { isOpen: isEditPolicyOpen, onOpen: onEditPolicyOpen, onClose: onEditPolicyClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const { isOpen: isAuthOpen, onOpen: onAuthOpen, onClose: onAuthClose } = useDisclosure();
  const { isOpen: isMfaOpen, onOpen: onMfaOpen, onClose: onMfaClose } = useDisclosure();

  const socket = useSocket();
  const toast = useToast();

  // Use the socket events hook
  useSocketEvents({ socket, toast, setPolicies });

  useEffect(() => {
    if (!socket) return;

    const handleAuthenticated = () => {
      onAuthClose();
      onMfaClose();
    };

    const handleMfaRequired = (msg: string) => {
      onAuthClose();
      setMfaError(msg);
      onMfaOpen();
    };

    socket.on('authenticated', handleAuthenticated);
    socket.on('mfa_required', handleMfaRequired);

    return () => {
      socket.off('authenticated', handleAuthenticated);
      socket.off('mfa_required', handleMfaRequired);
    };
  }, [socket, policyToAuth, onAuthClose, onMfaClose, onMfaOpen]);

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
    if (!socket) return;

    if (!policy.authenticated) {
      setPolicyToAuth(policy);
      onAuthOpen();
    } else {
      policy.logs = '';
      socket.emit('start', policy.name );
    }
  };

  const handleAuthSubmit = (password: string) => {
    if (!socket || !policyToAuth) return;
    socket.emit('authenticate', policyToAuth.name, password);
  };

  const handleMfaSubmit = (code: string) => {
    if (!socket || !policyToAuth) return;
    setMfaError(undefined);
    socket.emit('provideMFA', policyToAuth.name, code);
  };

  const handlePolicyInterrupt = (policy: Policy) => {
    if (!socket) return;
    socket.emit('interrupt', policy.name);
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
                  pt={1}
                  onClick={handleAddNewClick}
                >
                  Add
                </Button>
              }
            >
              <PolicyList
                policies={policies}
                setPolicies={setPolicies}
                onEdit={handlePolicyEdit}
                onDelete={handlePolicyDelete}
                onRun={handlePolicyRun}
                onInterrupt={handlePolicyInterrupt}
                socket={socket}
                toast={toast}
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

        {isDeleteOpen && (
          <DeleteConfirmationDialog
            isOpen={isDeleteOpen}
            onClose={onDeleteClose}
            onConfirm={confirmDelete}
            policyName={policyToDelete?.name || ''}
          />
        )}

        {isAuthOpen && (
          <AuthenticationModal
            isOpen={true}
            onClose={() => {
              onAuthClose();
              setPolicyToAuth(undefined);
            }}
            onSubmit={handleAuthSubmit}
            username={policyToAuth?.username || ''}
            socket={socket}
          />
        )}

        {isMfaOpen && (
          <MFAModal
            isOpen={true}
            onClose={() => {
              onMfaClose();
              setPolicyToAuth(undefined);
              setMfaError(undefined);
            }}
            onSubmit={handleMfaSubmit}
            error={mfaError}
            socket={socket}
          />
        )}

      </Container>
    </Box>
  );
}
