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
  useToast,
} from '@chakra-ui/react';
import { CreatePolicyModal } from '@/components/CreatePolicyModal';
import { Banner } from '@/components/Banner';
import { Panel } from '@/components/Panel';
import { useSocket } from '@/hooks/useSocket';
import { Policy } from '@/types/index';

export default function Home() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [activePolicies, setActivePolicies] = useState<Policy[]>([]);
  const socket = useSocket();
  const toast = useToast();

  useEffect(() => {
    if (!socket) return;

    // Request initial policies
    socket.emit('getPolicies');

    // Set up event listeners
    socket.on('policies', (loadedPolicies: Policy[]) => {
      console.log('Received policies:', loadedPolicies);
      setPolicies(loadedPolicies);
      setActivePolicies(loadedPolicies.filter(p => p.status === 'active'));
    });

    socket.on('policyAdded', (newPolicy: Policy) => {
      setPolicies(prev => [...prev, newPolicy]);
      if (newPolicy.status === 'active') {
        setActivePolicies(prev => [...prev, newPolicy]);
      }
    });

    socket.on('policyUpdated', (updatedPolicy: Policy) => {
      setPolicies(prev => prev.map(p => p.name === updatedPolicy.name ? updatedPolicy : p));
      setActivePolicies(prev => {
        const newActive = prev.filter(p => p.name !== updatedPolicy.name);
        if (updatedPolicy.status === 'active') {
          newActive.push(updatedPolicy);
        }
        return newActive;
      });
    });

    socket.on('policyDeleted', (name: string) => {
      setPolicies(prev => prev.filter(p => p.name !== name));
      setActivePolicies(prev => prev.filter(p => p.name !== name));
    });

    socket.on('connect_error', () => {
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to server. Please check if the server is running.',
        status: 'error',
        duration: null,
        isClosable: true,
      });
    });

    // Cleanup
    return () => {
      socket.off('policies');
      socket.off('policyAdded');
      socket.off('policyUpdated');
      socket.off('policyDeleted');
      socket.off('connect_error');
    };
  }, [socket, toast]);

  const handlePolicyCreated = (newPolicy: Policy) => {
    setPolicies(prev => [...prev, newPolicy]);
    if (newPolicy.status === 'active') {
      setActivePolicies(prev => [...prev, newPolicy]);
    }
  };

  return (
    <Box bg="gray.200" minH="100vh">
      <Banner />

      {/* Main Content */}
      <Container maxW="container.xl" py={8}>
        <VStack spacing={8} align="center" width="100%">

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
                  Add
                </Button>
              }
            >
              {policies.length > 0 ? (
                policies.map((policy, index) => (
                  <Flex
                    key={policy.name}
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
                ))
              ) : (
                <Text
                  color="gray.500"
                  textAlign="center"
                  fontFamily="Inter, sans-serif"
                  fontSize="14px"
                >
                  No policies created yet
                </Text>
              )}
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