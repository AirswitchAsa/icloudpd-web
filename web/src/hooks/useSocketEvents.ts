import { useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { UseToastOptions } from '@chakra-ui/react';
import { Policy } from '@/types';

interface UseSocketEventsProps {
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
  setPolicies: (policies: Policy[]) => void;
}

export function useSocketEvents({ socket, toast, setPolicies }: UseSocketEventsProps) {
  useEffect(() => {
    if (!socket) return;

    // Request initial policies
    socket.emit('getPolicies');

    // Policy list update events (only successful operations)
    const policyUpdateEvents = [
      'policies',                    // Initial load
      'policies_after_save',         // After successful save
      'policies_after_delete',       // After successful delete
      'policies_after_interrupt'     // After successful interrupt
    ];

    policyUpdateEvents.forEach(event => {
      socket.on(event, (policies: Policy[]) => {
        setPolicies(policies);
        // Show success notification for specific events
        if (event !== 'policies') { // Don't show for initial load
          const messages = {
            policies_after_save: 'Policy saved successfully',
            policies_after_delete: 'Policy deleted successfully',
            policies_after_interrupt: 'Download interrupted successfully'
          };
          toast({
            title: 'Success',
            description: messages[event as keyof typeof messages],
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        }
      });
    });

    // Error events
    const errorEvents = {
      connect_error: 'Failed to connect to server',
      error_saving_policy: 'Failed to save policy',
      error_deleting_policy: 'Failed to delete policy',
      error_interrupting_download: 'Failed to interrupt download',
      authentication_failed: 'Authentication failed',
      download_failed: 'Failed to download photos'
    };

    Object.entries(errorEvents).forEach(([event, defaultMessage]) => {
      socket.on(event, (data: any) => {
        const errorMessage = data?.error || data?.message || '';
        const policyName = data?.policy_name ? ` "${data.policy_name}"` : '';
        
        toast({
          title: 'Error',
          description: `${defaultMessage}${policyName}${errorMessage ? ': ' + errorMessage : ''}`,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      });
    });

    // Authentication success
    socket.on('authenticated', ({ msg, policies }: { msg: string; policies: Policy[] }) => {
      toast({
        title: 'Authentication Successful',
        description: msg,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setPolicies(policies);
    });

    // MFA required
    socket.on('mfa_required', (msg: string) => {
      toast({
        title: 'MFA Required',
        description: msg,
        status: 'info',
        duration: 3000,
        isClosable: true,
      });

    });

    // Download progress
    socket.on('download_progress', ({ policy_name, progress }: { policy_name: string; progress: number }) => {
      // TODO: Update progress bar for specific policy
      console.log(`Download progress for ${policy_name}: ${progress}%`);
    });

    socket.on('download_finished', ({ policy_name }: { policy_name: string }) => {
      toast({
        title: 'Download Complete',
        description: `Successfully downloaded photos for policy "${policy_name}"`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    });

    // Cleanup
    return () => {
      policyUpdateEvents.forEach(event => socket.off(event));
      Object.keys(errorEvents).forEach(event => socket.off(event));
      socket.off('authenticated');
      socket.off('mfa_required');
      socket.off('download_progress');
      socket.off('download_finished');
    };
  }, [socket, toast, setPolicies]);
}
