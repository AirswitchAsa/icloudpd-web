'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Button,
  VStack,
  Flex,
  useDisclosure,
} from '@chakra-ui/react';
import { PolicyList } from '@/components/PolicyList';
import { CreatePolicyModal } from '@/components/CreatePolicyModal';
import { Banner } from '@/components/Banner';
import { Panel } from '@/components/Panel';
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
    <Box bg="gray.200" minH="100vh">
      <Banner />

      {/* Main Content */}
      <Container maxW="container.xl" py={8}>
        <VStack spacing={8} align="center" width="100%">
          {/* Recents and Running Panels in a row */}
          <Flex width="61.8%" gap={8}>
            <Panel title="Recents" width="50%" />
            <Panel title="Running" width="50%" />
          </Flex>

          {/* All Policies Panel */}
          <Box width="61.8%">
            <Flex justify="space-between" align="center">
              <Panel 
                title="All Policies"
                width="100%"
                headerRight={
                  <Button
                    bg="black"
                    color="white"
                    _hover={{ bg: 'gray.800' }}
                    borderRadius="xl"
                    fontFamily="Inter, sans-serif"
                    fontSize="14px"
                    onClick={onOpen}
                  >
                    Create New Policy
                  </Button>
                }
              />
            </Flex>
          </Box>
        </VStack>

        <CreatePolicyModal isOpen={isOpen} onClose={onClose} />
      </Container>
    </Box>
  );
} 