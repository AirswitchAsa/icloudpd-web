import {
  Box,
  Button,
  Flex,
  Text,
  Progress,
  IconButton,
  Collapse,
  useDisclosure,
  VStack,
  Spinner,
  UseToastOptions,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, EditIcon, DeleteIcon, CopyIcon } from '@chakra-ui/icons';
import { FaPlay, FaPause } from 'react-icons/fa';
import { Policy } from '@/types/index';
import { InterruptConfirmationDialog } from './InterruptConfirmationDialog';
import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { SocketAddress } from 'net';

interface PolicyListProps {
  policies: Policy[];
  setPolicies: (policies: Policy[]) => void;
  onEdit: (policy: Policy) => void;
  onDelete: (policy: Policy) => void;
  onRun: (policy: Policy) => void;
  onInterrupt: (policy: Policy) => void;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
}

export const PolicyList = ({ 
  policies, 
  setPolicies,
  onEdit, 
  onDelete, 
  onRun, 
  onInterrupt, 
  socket, 
  toast 
}: PolicyListProps) => {
  return (
    <VStack spacing={2} width="100%" align="stretch">
      {policies.length > 0 ? (
        policies.map((policy) => (
          <PolicyRow
            key={policy.name}
            policy={policy}
            setPolicies={setPolicies}
            onEdit={onEdit}
            onDelete={onDelete}
            onRun={onRun}
            onInterrupt={onInterrupt}
            socket={socket}
            toast={toast}
          />
        ))
      ) : (
        <Box
          height="100px"
          display="grid"
          placeItems="center"
        >
          <Text color="gray.500" textAlign="center" fontFamily="Inter, sans-serif" fontSize="14px">
            No policies created yet
          </Text>
        </Box>
      )}
    </VStack>
  );
};

interface PolicyRowProps {
  policy: Policy;
  setPolicies: (policies: Policy[]) => void;
  onEdit: (policy: Policy) => void;
  onDelete: (policy: Policy) => void;
  onRun: (policy: Policy) => void;
  onInterrupt: (policy: Policy) => void;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
}

const PolicyRow = ({ 
  policy, 
  setPolicies,
  onEdit, 
  onDelete, 
  onRun, 
  onInterrupt, 
  socket, 
  toast 
}: PolicyRowProps) => {
  const { isOpen, onToggle } = useDisclosure();
  const { 
    isOpen: isInterruptOpen, 
    onOpen: onInterruptOpen, 
    onClose: onInterruptClose 
  } = useDisclosure();
  const [isWaitingRun, setIsWaitingRun] = useState(false);

  const handleInterrupt = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInterruptOpen();
  };

  const confirmInterrupt = () => {
    onInterrupt(policy);
    onInterruptClose();
  };

  const handleRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (socket && policy.authenticated) {
      setIsWaitingRun(true);
      socket.once('icloud_is_busy', () => {
        setIsWaitingRun(false);
      });
      socket.once('download_failed', () => {
        setIsWaitingRun(false);
      });
    }
    onRun(policy);
  };

  // Reset waiting state when we get progress or policy changes
  useEffect(() => {
    if (policy.status === 'running') {
      setIsWaitingRun(false);
    }
  }, [policy.status]);

  const getStatusDisplay = (policy: Policy) => {
    if (policy.status === 'running') {
      return {
        text: 'running',
        color: 'blue.500'
      };
    }
    if (policy.status === 'errored') {
      return {
        text: 'errored',
        color: 'red.500'
      };
    }
    if (policy.authenticated) {
      if (policy.progress === 100) {
        return {
          text: 'done',
          color: 'green.500'
        };
      }
      return {
        text: 'ready',
        color: 'green.500'
      };
    }
    return {
      text: 'unauthenticated',
      color: 'gray.500'
    };
  };

  const status = getStatusDisplay(policy);

  const renderActionButton = () => {
    if (isWaitingRun) {
      return (
        <IconButton
          aria-label="Loading"
          icon={<Spinner size="sm" />}
          colorScheme="blue"
          variant="ghost"
          size="sm"
        />
      );
    }

    if (policy.status === 'running') {
      return (
        <IconButton
          aria-label="Pause download"
          icon={<FaPause />}
          colorScheme="blue"
          variant="ghost"
          size="sm"
          onClick={handleInterrupt}
        />
      );
    }
    
    return (
      <IconButton
        aria-label="Run policy"
        icon={<FaPlay />}
        colorScheme="green"
        variant="ghost"
        size="sm"
        onClick={handleRun}
      />
    );
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!socket) return;

    const duplicatedPolicy = {
      ...policy,
      name: `${policy.name} COPY`,
      authenticated: false // Reset authentication state for the new policy
    };

    socket.once('policies_after_create', (policies: Policy[]) => {
      setPolicies(policies);
    });

    socket.once('error_creating_policy', ({ policy_name, error }: { policy_name: string; error: string }) => {
      toast({
        title: 'Error',
        description: `Failed to create policy "${policy_name}": ${error}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    });

    socket.emit('createPolicy', duplicatedPolicy);
  };

  return (
    <Box width="100%" borderWidth="1px" borderRadius="lg" overflow="hidden">
      <Flex
        p={4}
        justify="space-between"
        align="center"
        bg={isOpen ? 'gray.50' : 'white'}
        onClick={onToggle}
        cursor="pointer"
        _hover={{ bg: 'gray.50' }}
      >
        <Flex flex={1} gap={4}>
          <IconButton
            aria-label="Expand row"
            icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
            variant="ghost"
            size="sm"
          />
          <Box flex={1}>
            <Text fontSize="16px" fontWeight="medium">
              {policy.name}
            </Text>
            <Flex gap={2} color="gray.500" fontSize="14px">
              <Text 
                color={status.color}
                fontWeight="medium"
              >
                {status.text}
              </Text>
              <Text>•</Text>
              <Text>{policy.username}</Text>
              <Text>•</Text>
              <Text>{policy.directory}</Text>
            </Flex>
          </Box>
          <Box width="150px" display="flex">
            <Box flex="1" mt={1}>
            <Text fontSize="12px" color="gray.600" fontWeight="medium">
                {policy.status === 'running' ? `${policy.progress || 0}%` : 'IDLE'}
              </Text>
                <Progress
                  value={policy.progress || 0}
                  size="sm"
                  colorScheme={policy.status === 'running' ? 'blue' : policy.status === 'errored' ? 'red' : 'green'}
                  borderRadius="full"
                />
              </Box>
          </Box>
        </Flex>
        <Flex gap={2} ml={4}>
          {renderActionButton()}
          <IconButton
            aria-label="Edit policy"
            icon={<EditIcon />}
            colorScheme="blue"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(policy);
            }}
            isDisabled={policy.status === 'running'}
          />
          <IconButton
            aria-label="Duplicate policy"
            icon={<CopyIcon />}
            colorScheme="blue"
            variant="ghost"
            size="sm"
            onClick={handleDuplicate}
            isDisabled={policy.status === 'running'}
          />
          <IconButton
            aria-label="Delete policy"
            icon={<DeleteIcon />}
            colorScheme="red"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(policy);
            }}
            isDisabled={policy.status === 'running'}
          />
        </Flex>
      </Flex>

      <InterruptConfirmationDialog
        isOpen={isInterruptOpen}
        onClose={onInterruptClose}
        onConfirm={confirmInterrupt}
        policyName={policy.name}
      />

      <Collapse in={isOpen}>
        <Box p={4} bg="gray.50">
          <Box 
            ml={12}
            maxH="300px"
            overflowY="auto"
            sx={{
              '&::-webkit-scrollbar': {
                width: '8px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                borderRadius: '8px',
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.15)',
                },
              },
            }}
          >
            <Text 
              fontSize="14px" 
              fontFamily="monospace" 
              whiteSpace="pre-wrap"
              sx={{
                wordBreak: 'break-word',
              }}
            >
              {policy.logs || 'No logs available'}
            </Text>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}; 