import { lazy, Suspense } from "react";
import {
  Box,
  Button,
  Container,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { Banner } from "./components/Banner";
import { Panel } from "./components/Panel";
import { PolicyList } from "./components/PolicyList";
import { ServerAuthenticationModal } from "./components/ServerAuthenticationModal";
import { ToastBridge } from "./components/ToastBridge";
import { useAuthStatus, useLogout } from "./hooks/useAuth";
import { usePolicies, usePoliciesLiveUpdate } from "./hooks/usePolicies";

const EditPolicyModal = lazy(() =>
  import("./components/EditPolicyModal").then((m) => ({ default: m.EditPolicyModal }))
);
const SettingsModal = lazy(() =>
  import("./components/SettingsModal").then((m) => ({ default: m.SettingsModal }))
);

export function App() {
  const { data: auth, isLoading: authLoading } = useAuthStatus();
  const logout = useLogout();
  const authenticated = auth?.authenticated ?? false;
  usePoliciesLiveUpdate(authenticated);
  const { data: policies } = usePolicies();

  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onClose: onEditClose,
  } = useDisclosure();
  const {
    isOpen: isSettingsOpen,
    onOpen: onSettingsOpen,
    onClose: onSettingsClose,
  } = useDisclosure();

  if (authLoading) {
    return <Box p={8}>Loading…</Box>;
  }

  if (!authenticated) {
    return <ServerAuthenticationModal isOpen />;
  }

  return (
    <Box bg="gray.200" minH="100vh">
      <ToastBridge />
      <Banner
        onSettingsClick={onSettingsOpen}
        onLogoutClick={() => {
          logout.mutate(undefined, {
            onSettled: () => {
              window.location.reload();
            },
          });
        }}
      />
      <Container maxW="container.xl" py={8}>
        <VStack spacing={8} align="center" width="100%">
          <Box width="100%">
            <Panel
              title="Policies"
              headerRight={
                <Button
                  bg="black"
                  color="white"
                  _hover={{ bg: "gray.800" }}
                  borderRadius="xl"
                  fontSize="12px"
                  size="sm"
                  px={4}
                  onClick={onEditOpen}
                >
                  Add
                </Button>
              }
            >
              <PolicyList policies={policies ?? []} />
            </Panel>
          </Box>
        </VStack>

        <Suspense fallback={null}>
          {isEditOpen && (
            <EditPolicyModal
              isOpen
              onClose={onEditClose}
              isEditing={false}
              policy={undefined}
            />
          )}
          {isSettingsOpen && (
            <SettingsModal isOpen onClose={onSettingsClose} />
          )}
        </Suspense>
      </Container>
    </Box>
  );
}
