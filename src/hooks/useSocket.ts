import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Policy } from '../server/handler';

interface ServerToClientEvents {
  policies: (policies: Policy[]) => void;
  policyAdded: (policy: Policy) => void;
  policyUpdated: (policy: Policy) => void;
  policyDeleted: (name: string) => void;
  terminalOutput: (data: { policyName: string; data: string }) => void;
  downloadComplete: (data: { policyName: string; exitCode: number }) => void;
  error: (data: { message: string }) => void;
}

interface ClientToServerEvents {
  getPolicies: () => void;
  addPolicy: (policy: Omit<Policy, 'status'>) => void;
  updatePolicyStatus: (data: { name: string; status: 'active' | 'inactive' }) => void;
  deletePolicy: (name: string) => void;
  startDownload: (data: { policyName: string; password: string }) => void;
}

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket() {
  const socketRef = useRef<ClientSocket | null>(null);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000') as ClientSocket;

      socketRef.current.on('connect', () => {
        console.log('Connected to server');
      });

      socketRef.current.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      socketRef.current.on('error', (error) => {
        console.error('Server error:', error.message);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return socketRef.current;
} 