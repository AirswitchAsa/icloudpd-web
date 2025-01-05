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
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, EditIcon, DeleteIcon } from '@chakra-ui/icons';
import { FaPlay } from 'react-icons/fa';
import { Policy } from '@/types/index';

interface PolicyListProps {
  policies: Policy[];
  onEdit: (policy: Policy) => void;
  onDelete: (policy: Policy) => void;
  onRun: (policy: Policy) => void;
}

export const PolicyList = ({ policies, onEdit, onDelete, onRun }: PolicyListProps) => {
  return (
    <VStack spacing={2} width="100%">
      {policies.length > 0 ? (
        policies.map((policy) => <PolicyRow key={policy.name} policy={policy} onEdit={onEdit} onDelete={onDelete} onRun={onRun} />)
      ) : (
        <Text color="gray.500" textAlign="center" fontFamily="Inter, sans-serif" fontSize="14px">
          No policies created yet
        </Text>
      )}
    </VStack>
  );
};

interface PolicyRowProps {
  policy: Policy;
  onEdit: (policy: Policy) => void;
  onDelete: (policy: Policy) => void;
  onRun: (policy: Policy) => void;
}

const PolicyRow = ({ policy, onEdit, onDelete, onRun }: PolicyRowProps) => {
  const { isOpen, onToggle } = useDisclosure();

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
              <Text>{policy.username}</Text>
              <Text>•</Text>
              <Text>{policy.directory}</Text>
            </Flex>
          </Box>
          <Box width="150px">
            <Text fontSize="14px" color="gray.600">
              {policy.status || 'Idle'}
            </Text>
            {policy.progress !== undefined && (
              <Progress
                value={policy.progress}
                size="sm"
                colorScheme="blue"
                borderRadius="full"
              />
            )}
          </Box>
        </Flex>
        <Flex gap={2}>
          <IconButton
            aria-label="Run policy"
            icon={<FaPlay />}
            colorScheme="green"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRun(policy);
            }}
          />
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
          />
        </Flex>
      </Flex>
      <Collapse in={isOpen}>
        <Box p={4} bg="gray.50">
          <Text fontSize="14px" fontFamily="monospace" whiteSpace="pre-wrap">
            {policy.logs || 'No logs available'}
          </Text>
        </Box>
      </Collapse>
    </Box>
  );
}; 