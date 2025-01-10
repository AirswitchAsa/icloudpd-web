"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Container,
  Button,
  VStack,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { EditPolicyModal } from "@/components/EditPolicyModal";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { Banner } from "@/components/Banner";
import { Panel } from "@/components/Panel";
import { PolicyList } from "@/components/PolicyList";
import { useSocket, SocketConfig } from "@/hooks/useSocket";
import { useSocketEvents } from "@/hooks/useSocketEvents";
import { Policy } from "@/types/index";
import { AuthenticationModal } from "@/components/AuthenticationModal";
import { MFAModal } from "@/components/MFAModal";
import { ServerAuthenticationModal } from "@/components/ServerAuthenticationModal";
import { SettingsModal } from "@/components/SettingsModal";

export default function Home() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | undefined>();
  const [policyToDelete, setPolicyToDelete] = useState<Policy | undefined>();
  const [policyToAuth, setPolicyToAuth] = useState<Policy | undefined>();
  const [mfaError, setMfaError] = useState<string>();
  const [isServerAuthenticated, setIsServerAuthenticated] = useState(false);
  const [socketConfig, setSocketConfig] = useState<SocketConfig>({
    clientId: "default-user",
    isGuest: false,
  });

  const {
    isOpen: isEditPolicyOpen,
    onOpen: onEditPolicyOpen,
    onClose: onEditPolicyClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const {
    isOpen: isAuthOpen,
    onOpen: onAuthOpen,
    onClose: onAuthClose,
  } = useDisclosure();
  const {
    isOpen: isMfaOpen,
    onOpen: onMfaOpen,
    onClose: onMfaClose,
  } = useDisclosure();
  const {
    isOpen: isSettingsOpen,
    onOpen: onSettingsOpen,
    onClose: onSettingsClose,
  } = useDisclosure();

  const socket = useSocket(socketConfig);
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

    const handleServerAuthenticated = () => {
      setIsServerAuthenticated(true);
    };

    socket.on("authenticated", handleAuthenticated);
    socket.on("mfa_required", handleMfaRequired);
    socket.on("server_authenticated", handleServerAuthenticated);

    return () => {
      socket.off("authenticated", handleAuthenticated);
      socket.off("mfa_required", handleMfaRequired);
      socket.off("server_authenticated", handleServerAuthenticated);
    };
  }, [socket, policyToAuth, onAuthClose, onMfaClose, onMfaOpen]);

  const handleServerAuthenticated = (clientId: string, isGuest: boolean) => {
    setSocketConfig({ clientId, isGuest });
    setIsServerAuthenticated(true);
  };

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

    socket?.emit("deletePolicy", policyToDelete.name);
    onDeleteClose();
    setPolicyToDelete(undefined);
  };

  const handlePolicyRun = (policy: Policy) => {
    if (!socket) return;

    if (!policy.authenticated) {
      setPolicyToAuth(policy);
      onAuthOpen();
    } else {
      policy.logs = "";
      socket.emit("start", policy.name);
    }
  };

  const handleAuthSubmit = (password: string) => {
    if (!socket || !policyToAuth) return;
    socket.emit("authenticate", policyToAuth.name, password);
  };

  const handleMfaSubmit = (code: string) => {
    if (!socket || !policyToAuth) return;
    setMfaError(undefined);
    socket.emit("provideMFA", policyToAuth.name, code);
  };

  const handlePolicyInterrupt = (policy: Policy) => {
    if (!socket) return;
    socket.emit("interrupt", policy.name);
  };

  const handleLogout = () => {
    if (!socket) return;
    socket.emit("logOut", socketConfig.clientId);
    setIsServerAuthenticated(false);
    setSocketConfig({
      clientId: "default-user",
      isGuest: false,
    });
  };

  if (!isServerAuthenticated) {
    return (
      <ServerAuthenticationModal
        isOpen={true}
        socket={socket}
        onAuthenticated={handleServerAuthenticated}
      />
    );
  }

  return (
    <Box bg="gray.200" minH="100vh">
      <Banner onSettingsClick={onSettingsOpen} onLogoutClick={handleLogout} />

      {/* Main Content */}
      <Container maxW="container.xl" py={8}>
        <VStack spacing={8} align="center" width="100%">
          {/* All Policies Panel */}
          <Box width="100%">
            <Panel
              title="Policies"
              headerRight={
                <Button
                  bg="black"
                  color="white"
                  _hover={{ bg: "gray.800" }}
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
            socketConfig={socketConfig}
          />
        )}

        {isDeleteOpen && (
          <DeleteConfirmationDialog
            isOpen={isDeleteOpen}
            onClose={onDeleteClose}
            onConfirm={confirmDelete}
            policyName={policyToDelete?.name || ""}
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
            username={policyToAuth?.username || ""}
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

        {isSettingsOpen && (
          <SettingsModal
            isOpen={true}
            onClose={onSettingsClose}
            socket={socket}
            isGuest={socketConfig.isGuest}
          />
        )}
      </Container>
    </Box>
  );
}
