import {
  VStack,
  Box,
  Text,
  Badge,
  Button,
  HStack,
} from '@chakra-ui/react';
import { PolicySpec } from '@/types';
import { useSocket } from '@/hooks/useSocket';

interface PolicyListProps {
  policies: PolicySpec[];
}

export function PolicyList({ policies }: PolicyListProps) {
  const socket = useSocket();

  const handleStart = (id: string) => {
    socket?.emit('startPolicy', id);
  };

  const handleStop = (id: string) => {
    socket?.emit('stopPolicy', id);
  };

  return (
    <VStack spacing={4} align="stretch">
      {policies.map((policy) => (
        <Box
          key={policy.id}
          p={4}
          borderWidth={1}
          borderRadius="md"
          shadow="sm"
        >
          <HStack justify="space-between">
            <VStack align="start" spacing={2}>
              <Text fontWeight="bold">{policy.username}</Text>
              <Text fontSize="sm" color="gray.600">
                Directory: {policy.directory}
              </Text>
              <Badge colorScheme={policy.status === 'active' ? 'green' : 'gray'}>
                {policy.status || 'inactive'}
              </Badge>
            </VStack>
            <HStack>
              {policy.status !== 'active' ? (
                <Button
                  size="sm"
                  colorScheme="green"
                  onClick={() => handleStart(policy.id)}
                >
                  Start
                </Button>
              ) : (
                <Button
                  size="sm"
                  colorScheme="red"
                  onClick={() => handleStop(policy.id)}
                >
                  Stop
                </Button>
              )}
            </HStack>
          </HStack>
        </Box>
      ))}
    </VStack>
  );
} 