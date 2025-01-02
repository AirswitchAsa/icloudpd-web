export interface Policy {
  name: string;
  username: string;
  directory: string;
}

export interface CreatePolicyInput {
  username: string;
  directory: string;
  syncMode: 'download' | 'sync';
  interval?: number;
} 
