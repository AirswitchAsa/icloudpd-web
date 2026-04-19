import { Box, Text, VStack, Alert, AlertIcon, Button } from "@chakra-ui/react";
import { useAuthStatus, useLogout } from "@/hooks/useAuth";

export function UserSettings() {
  const { data: auth } = useAuthStatus();
  const logout = useLogout();

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        <Box>
          <Text fontWeight="bold" fontSize="lg" mb={4}>
            Session
          </Text>
          <VStack spacing={3} align="stretch" maxW="400px">
            {auth?.auth_required ? (
              <Alert status="info">
                <AlertIcon />
                This server requires a password. You are currently signed in.
              </Alert>
            ) : (
              <Alert status="info">
                <AlertIcon />
                This server is configured without password authentication.
              </Alert>
            )}
            <Button
              onClick={() => {
                logout.mutate(undefined, {
                  onSettled: () => {
                    window.location.reload();
                  },
                });
              }}
              bg="black"
              color="white"
              _hover={{ bg: "gray.800" }}
              size="sm"
              isLoading={logout.isPending}
            >
              Sign out
            </Button>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
}
