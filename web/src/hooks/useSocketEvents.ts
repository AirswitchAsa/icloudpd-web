import { useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { useToast } from '@chakra-ui/react';
import { Policy } from '@/types/index';

interface UseSocketEventsProps {
  socket: Socket | null;
  toast: ReturnType<typeof useToast>;
  setPolicies: (policies: Policy[]) => void;
}

export function useSocketEvents({ socket, toast, setPolicies }: UseSocketEventsProps) {
  useEffect(() => {
    if (!socket) return;

    // Request initial policies
    socket.emit('getPolicies');

    // Set up event listeners
    socket.on('policies', (loadedPolicies: Policy[]) => {
      console.log('Received policies:', loadedPolicies);
      setPolicies(loadedPolicies);
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

    // Authentication events
    socket.on('authenticated', (msg: string) => {
      toast({
        title: 'Authentication Successful',
        description: msg,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    });

    socket.on('authentication_failed', (msg: string) => {
      toast({
        title: 'Authentication Failed',
        description: msg,
        status: 'error',
        duration: null,
        isClosable: true,
      });
    });

    socket.on('mfa_required', (msg: string) => {
      toast({
        title: 'MFA Required',
        description: msg,
        status: 'info',
        duration: null,
        isClosable: true,
      });
      // TODO: Show MFA input modal
    });

    // Policy events
    socket.on('save_policy_failed', ({ policy_name, error }: { policy_name: string; error: string }) => {
      toast({
        title: 'Failed to Save Policy',
        description: `Failed to save policy "${policy_name}": ${error}`,
        status: 'error',
        duration: null,
        isClosable: true,
      });
    });

    socket.on('delete_policy_failed', ({ policy_name, error }: { policy_name: string; error: string }) => {
      toast({
        title: 'Failed to Delete Policy',
        description: `Failed to delete policy "${policy_name}": ${error}`,
        status: 'error',
        duration: null,
        isClosable: true,
      });
    });

    // Download events
    socket.on('download_progress', ({ policy_name, progress, logs }: { policy_name: string; progress: number; logs: string }) => {
      // TODO: Update progress bar for specific policy
      console.log(`Download progress for ${policy_name}: ${progress}%`);
      if (logs) {
        console.log('Download logs:', logs);
      }
    });

    socket.on('download_finished', ({ policy_name, logs }: { policy_name: string; logs: string }) => {
      toast({
        title: 'Download Complete',
        description: `Successfully downloaded photos for policy "${policy_name}"`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    });

    socket.on('download_failed', ({ policy_name, error, logs }: { policy_name: string; error: string; logs: string }) => {
      toast({
        title: 'Download Failed',
        description: `Failed to download photos for policy "${policy_name}": ${error}`,
        status: 'error',
        duration: null,
        isClosable: true,
      });
    });

    // Cleanup
    return () => {
      socket.off('policies');
      socket.off('connect_error');
      socket.off('authenticated');
      socket.off('authentication_failed');
      socket.off('mfa_required');
      socket.off('save_policy_failed');
      socket.off('download_progress');
      socket.off('download_finished');
      socket.off('download_failed');
    };
  }, [socket, toast, setPolicies]);
}
