'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Button,
  VStack,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { EditPolicyModal } from '@/components/EditPolicyModal';
import { Banner } from '@/components/Banner';
import { Panel } from '@/components/Panel';
import { PolicyList } from '@/components/PolicyList';
import { useSocket } from '@/hooks/useSocket';
import { useSocketEvents } from '@/hooks/useSocketEvents';
import { Policy } from '@/types/index';

export default function Home() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const socket = useSocket();
  const toast = useToast();

  // Use the socket events hook
  useSocketEvents({ socket, toast, setPolicies });

  const handlePolicySaved = (newPolicy: Policy) => {
    setPolicies(prev => [...prev, newPolicy]);
  };

  const handlePolicyEdit = (policy: Policy) => {
    // TODO: Implement policy editing
    console.log('Edit policy:', policy);
  };

  const handlePolicyDelete = (policy: Policy) => {
    // TODO: Implement policy deletion
    console.log('Delete policy:', policy);
  };

  const handlePolicyRun = (policy: Policy) => {
    // TODO: Implement policy running
    console.log('Run policy:', policy);
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
              <PolicyList
                policies={policies}
                onEdit={handlePolicyEdit}
                onDelete={handlePolicyDelete}
                onRun={handlePolicyRun}
              />
            </Panel>
          </Box>
        </VStack>

        <EditPolicyModal 
          isOpen={isOpen} 
          onClose={onClose} 
          onPolicySaved={handlePolicySaved}
          isEditing={false}
        />
      </Container>
    </Box>
  );
}
