export interface Policy {
  name: string;
  username: string;
  directory: string;
  status?: string;
  progress?: number;
  logs?: string;
}

export interface CreatePolicyInput {
  username: string;
  directory: string;
  syncMode: 'download' | 'sync';
  interval?: number;
} 
