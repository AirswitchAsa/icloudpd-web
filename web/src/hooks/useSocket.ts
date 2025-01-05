import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Define types for the different event payloads
interface DownloadProgressPayload {
  policy_name: string;
  progress: number;
  logs: string;
}

interface DownloadFinishedPayload {
  policy_name: string;
  logs: string;
}

interface DownloadFailedPayload {
  policy_name: string;
  error: string;
  logs: string;
}

interface SavePolicyFailedPayload {
  policy_name: string;
  error: string;
}

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    console.log('Attempting to connect to WebSocket server...');
    
    const newSocket = io('http://pulse.local:5000', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Basic connection events
    newSocket.on('connect', () => {
      console.log('Connected to Python server');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
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

    // Policy management events
    newSocket.on('save_policy_failed', (payload: SavePolicyFailedPayload) => {
      console.error('Failed to save policy:', payload);
    });

    // Download events
    newSocket.on('download_progress', (payload: DownloadProgressPayload) => {
      console.log('Download progress:', payload);
    });

    newSocket.on('download_finished', (payload: DownloadFinishedPayload) => {
      console.log('Download finished:', payload);
    });

    newSocket.on('download_failed', (payload: DownloadFailedPayload) => {
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
