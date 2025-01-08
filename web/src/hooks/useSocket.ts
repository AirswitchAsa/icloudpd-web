import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Policy } from '@/types';

// This will be replaced with proper user authentication later
const CLIENT_ID = 'default-user';

// Define types for the different event payloads
interface PolicyUpdatePayload {
  policies: Policy[];
}

interface ErrorWithPoliciesPayload {
  policy_name: string;
  error: string;
  current_policies: Policy[];
}

interface ErrorPayload {
  error: string;
  policy_name?: string;
  message?: string;
}

interface DownloadProgressPayload {
  policy_name: string;
  progress: number;
  logs: string;
}

interface DownloadFinishedPayload {
  policy_name: string;
  logs: string;
}

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    console.log('Attempting to connect to WebSocket server...');
    
    const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://pulse.local:5000';
    const newSocket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      // setting custom headers is not supported when using transports: ['websocket']
      // see https://socket.io/docs/v4/client-options/#extraheaders
      auth: {
        clientId: CLIENT_ID
      }
    });

    // Basic connection events
    newSocket.on('connect', () => {
      console.log('Connected to Python server');
    });

    newSocket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error.message);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    // Policy update events
    const policyUpdateEvents = [
      'policies',
      'uploaded_policies',
      'policies_after_save',
      'policies_after_delete',
    ];

    policyUpdateEvents.forEach(event => {
      newSocket.on(event, (payload: Policy[]) => {
        console.log(`${event}:`, payload);
      });
    });

    // Error events with policies
    const errorEventsWithPolicies = [
      'error_saving_policy',
      'error_deleting_policy',
      'error_interrupting_download'
    ];

    errorEventsWithPolicies.forEach(event => {
      newSocket.on(event, (payload: ErrorWithPoliciesPayload) => {
        console.error(`${event}:`, payload);
      });
    });

    // Authentication events
    newSocket.on('authenticated', (msg: string) => {
      console.log('Authentication successful:', msg);
    });

    newSocket.on('authentication_failed', (msg: string) => {
      console.error('Authentication failed:', msg);
    });

    newSocket.on('mfa_required', (msg: string) => {
      console.log('MFA required:', msg);
    });

    // Download events
    newSocket.on('download_progress', (payload: DownloadProgressPayload) => {
      console.log('Download progress:', payload);
    });

    newSocket.on('download_finished', (payload: DownloadFinishedPayload) => {
      console.log('Download finished:', payload);
    });

    newSocket.on('download_failed', (payload: ErrorPayload) => {
      console.error('Download failed:', payload);
    });

    setSocket(newSocket);

    return () => {
      console.log('Cleaning up socket connection');
      newSocket.close();
    };
  }, []);

  return socket;
}
