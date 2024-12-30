'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Button,
  VStack,
  Flex,
  useDisclosure,
  Text,
} from '@chakra-ui/react';
import { CreatePolicyModal } from '@/components/CreatePolicyModal';
import { Banner } from '@/components/Banner';
import { Panel } from '@/components/Panel';
import { Policy } from '@/server/handler';
import { useSocket } from '@/hooks/useSocket';

export default function Home() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [activePolicies, setActivePolicies] = useState<Policy[]>([]);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    // Initial load of policies
    socket.emit('getPolicies');

    // Set up event listeners
    socket.on('policies', (loadedPolicies) => {
      setPolicies(loadedPolicies);
      setActivePolicies(loadedPolicies.filter(p => p.status === 'active'));
    });

    socket.on('policyAdded', (newPolicy) => {
      setPolicies(prev => [...prev, newPolicy]);
      if (newPolicy.status === 'active') {
        setActivePolicies(prev => [...prev, newPolicy]);
      }
    });

    socket.on('policyUpdated', (updatedPolicy) => {
      setPolicies(prev => prev.map(p => p.name === updatedPolicy.name ? updatedPolicy : p));
      setActivePolicies(prev => {
        const newActive = prev.filter(p => p.name !== updatedPolicy.name);
        if (updatedPolicy.status === 'active') {
          newActive.push(updatedPolicy);
        }
        return newActive;
      });
    });

    socket.on('policyDeleted', (name) => {
      setPolicies(prev => prev.filter(p => p.name !== name));
      setActivePolicies(prev => prev.filter(p => p.name !== name));
    });

    // Cleanup
    return () => {
      socket.off('policies');
      socket.off('policyAdded');
      socket.off('policyUpdated');
      socket.off('policyDeleted');
    };
  }, [socket]);

  const handlePolicyCreated = (newPolicy: Policy) => {
    // No need to manually update state here as it will be handled by the socket events
  };

  return (
    <Box bg="gray.200" minH="100vh">
      <Banner />

      {/* Main Content */}
      <Container maxW="container.xl" py={8}>
        <VStack spacing={8} align="center" width="100%">
          {/* Recents and Running Panels in a row */}
          <Flex width="61.8%" gap={8}>
            <Panel title="Recents" width="50%">
              {policies.slice(0, 5).map((policy, index) => (
                <Text
                  key={index}
                  p={2}
                  borderBottom="1px"
                  borderColor="gray.100"
                  fontSize="14px"
                  fontFamily="Inter, sans-serif"
                >
                  {policy.name}
                </Text>
              ))}
            </Panel>
            <Panel title="Running" width="50%">
              {activePolicies.map((policy, index) => (
                <Text
                  key={index}
                  p={2}
                  borderBottom="1px"
                  borderColor="gray.100"
                  fontSize="14px"
                  fontFamily="Inter, sans-serif"
                >
                  {policy.name}
                </Text>
              ))}
            </Panel>
          </Flex>

          {/* All Policies Panel */}
          <Box width="61.8%">
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
            >
              {policies.map((policy, index) => (
                <Flex
                  key={index}
                  p={4}
                  borderBottom="1px"
                  borderColor="gray.100"
                  justify="space-between"
                  align="center"
                >
                  <Box>
                    <Text
                      fontSize="16px"
                      fontWeight="medium"
                      fontFamily="Inter, sans-serif"
                    >
                      {policy.name}
                    </Text>
                    <Text
                      fontSize="14px"
                      color="gray.500"
                      fontFamily="Inter, sans-serif"
                    >
                      {policy.account} • {policy.album}
                    </Text>
                  </Box>
                  <Text
                    fontSize="14px"
                    color={policy.status === 'active' ? 'green.500' : 'gray.500'}
                    fontFamily="Inter, sans-serif"
                  >
                    {policy.status}
                  </Text>
                </Flex>
              ))}
            </Panel>
          </Box>
        </VStack>

        <CreatePolicyModal 
          isOpen={isOpen} 
          onClose={onClose} 
          onPolicyCreated={handlePolicyCreated}
        />
      </Container>
    </Box>
  );
} 