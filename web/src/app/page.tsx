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
import { Banner } from "@/components/Banner";
import { Panel } from "@/components/Panel";
import { PolicyList } from "@/components/PolicyList";
import { useSocket, SocketConfig } from "@/hooks/useSocket";
import { useSocketEvents } from "@/hooks/useSocketEvents";
import { Policy } from "@/types/index";
import { ServerAuthenticationModal } from "@/components/ServerAuthenticationModal";
import { SettingsModal } from "@/components/SettingsModal";

export default function Home() {
  const [policies, setPolicies] = useState<Policy[]>([]);
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

    const handleServerAuthenticated = () => {
      setIsServerAuthenticated(true);
    };

    socket.on("server_authenticated", handleServerAuthenticated);

    return () => {
      socket.off("server_authenticated", handleServerAuthenticated);
    };
  }, [socket]);

  const handleServerAuthenticated = (clientId: string, isGuest: boolean) => {
    setSocketConfig({ clientId, isGuest });
    setIsServerAuthenticated(true);
  };

  const handleLogout = () => {
    if (!socket) return;
    socket.emit("log_out", socketConfig.clientId);
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
                  onClick={onEditPolicyOpen}
                >
                  Add
                </Button>
              }
            >
              <PolicyList
                policies={policies}
                setPolicies={setPolicies}
                socket={socket}
                toast={toast}
              />
            </Panel>
          </Box>
        </VStack>

        {isEditPolicyOpen && (
          <EditPolicyModal
            isOpen={isEditPolicyOpen}
            onClose={onEditPolicyClose}
            setPolicies={setPolicies}
            isEditing={false}
            policy={undefined}
            socket={socket}
          />
        )}

        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={onSettingsClose}
            socket={socket}
            isGuest={socketConfig.isGuest}
          />
        )}
      </Container>
    </Box>
  );
}
