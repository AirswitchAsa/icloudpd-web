export interface PolicySpec {
  id: string;
  username: string;
  directory: string;
  syncMode: 'download' | 'sync';
  interval?: number;
  status?: 'active' | 'inactive' | 'error';
  lastRun?: Date;
}

export interface PolicyStatus {
  id: string;
  status: 'running' | 'stopped' | 'error';
  message?: string;
  progress?: number;
}

export interface CreatePolicyInput {
  username: string;
  directory: string;
  syncMode: 'download' | 'sync';
  interval?: number;
} 