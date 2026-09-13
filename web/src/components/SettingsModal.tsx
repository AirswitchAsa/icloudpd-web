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
import { GeneralSettings } from "./settings/GeneralSettings";
import { IntegrationSettings } from "./settings/IntegrationSettings";
import { UserSettings } from "./settings/UserSettings";

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "2026.4.20.post1";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "general" | "integration" | "user";

interface TabConfig {
  id: TabType;
  label: string;
}

const TABS: TabConfig[] = [
  { id: "general", label: "General" },
  { id: "integration", label: "Notifications" },
  { id: "user", label: "User" },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("general");

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" maxH="calc(100vh - 2rem)" mx={2}>
        <ModalHeader borderBottomWidth="1px" px={{ base: 4, md: 6 }}>
          Settings
        </ModalHeader>
        <ModalBody p={0}>
          <Flex
            h={{ base: "calc(100vh - 9rem)", md: "600px" }}
            direction={{ base: "column", md: "row" }}
          >
            <Box
              w={{ base: "100%", md: "240px" }}
              flexShrink={0}
              borderRightWidth={{ base: 0, md: "1px" }}
              borderBottomWidth={{ base: "1px", md: 0 }}
              p={{ base: 2, md: 6 }}
            >
              <VStack
                spacing={2}
                align="stretch"
                direction={{ base: "row", md: "column" }}
                overflowX={{ base: "auto", md: "visible" }}
              >
                {TABS.map((tab) => (
                  <Box
                    key={tab.id}
                    flexShrink={0}
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

            <Box flex={1} minH={0} p={{ base: 4, md: 8 }} overflowY="auto">
              {activeTab === "general" && <GeneralSettings />}
              {activeTab === "integration" && <IntegrationSettings />}
              {activeTab === "user" && <UserSettings />}
            </Box>
          </Flex>
        </ModalBody>
        <ModalFooter borderTopWidth="1px" px={{ base: 4, md: 6 }}>
          <Text fontSize="xs" color="gray.500" mr="auto">
            Version {APP_VERSION}
          </Text>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
