import { useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Box,
  Flex,
  VStack,
  Text,
} from "@chakra-ui/react";
import { Socket } from "socket.io-client";
import { GeneralSettings } from "./settings/GeneralSettings";
import { DownloadSettings } from "./settings/DownloadSettings";
import { UserSettings } from "./settings/UserSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  socket: Socket | null;
  isGuest: boolean;
}

type TabType = "general" | "download" | "user";

interface TabConfig {
  id: TabType;
  label: string;
  component: React.ComponentType<any>;
}

const TABS: TabConfig[] = [
  { id: "general", label: "General", component: GeneralSettings },
  { id: "download", label: "Download", component: DownloadSettings },
  { id: "user", label: "User", component: UserSettings },
];

export function SettingsModal({
  isOpen,
  onClose,
  socket,
  isGuest,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("general");

  const ActiveComponent =
    TABS.find((tab) => tab.id === activeTab)?.component || GeneralSettings;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl">
        <ModalHeader borderBottomWidth="1px">Settings</ModalHeader>
        <ModalBody p={0}>
          <Flex h="600px">
            {/* Left sidebar */}
            <Box w="240px" borderRightWidth="1px" p={6}>
              <VStack spacing={2} align="stretch">
                {TABS.map((tab) => (
                  <Box
                    key={tab.id}
                    py={2}
                    px={4}
                    cursor="pointer"
                    borderRadius="md"
                    bg={activeTab === tab.id ? "gray.100" : "transparent"}
                    _hover={{
                      bg: activeTab === tab.id ? "gray.100" : "gray.50",
                    }}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Text
                      fontSize="sm"
                      fontWeight={activeTab === tab.id ? "semibold" : "normal"}
                      color={activeTab === tab.id ? "black" : "gray.600"}
                    >
                      {tab.label}
                    </Text>
                  </Box>
                ))}
              </VStack>
            </Box>

            {/* Right content area */}
            <Box flex={1} p={8} overflowY="auto">
              <ActiveComponent socket={socket} isGuest={isGuest} />
            </Box>
          </Flex>
        </ModalBody>
        <ModalFooter borderTopWidth="1px">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
