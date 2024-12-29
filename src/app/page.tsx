'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Button,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { PolicyList } from '@/components/PolicyList';
import { CreatePolicyModal } from '@/components/CreatePolicyModal';
import { useSocket } from '@/hooks/useSocket';
import { PolicySpec } from '@/types';

export default function Home() {
  const [policies, setPolicies] = useState<PolicySpec[]>([]);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const socket = useSocket();

  useEffect(() => {
    if (socket) {
      socket.emit('getPolicies');
      socket.on('policies', (policies: PolicySpec[]) => {
        setPolicies(policies);
      });
    }
  }, [socket]);

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Heading>iCloud Photo Downloader</Heading>
          <Button colorScheme="blue" onClick={onOpen}>
            Create New Policy
          </Button>
        </Box>

        <PolicyList policies={policies} />
        
        <CreatePolicyModal isOpen={isOpen} onClose={onClose} />
      </VStack>
    </Container>
  );
} 