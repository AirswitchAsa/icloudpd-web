import { parse, stringify } from '@iarna/toml';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface Policy {
  name: string;
  account: string;
  album: string;
  directory: string;
  status: 'active' | 'inactive';
}

interface PolicyFile {
  policies: Policy[];
  [key: string]: unknown;
}

export class PolicyHandler {
  private policies: Policy[] = [];
  private filePath: string;

  constructor() {
    this.filePath = join(process.cwd(), 'src/data/policies.toml');
    this.loadPolicies();
  }

  private loadPolicies() {
    try {
      const fileContent = readFileSync(this.filePath, 'utf-8');
      const data = parse(fileContent) as unknown as PolicyFile;
      this.policies = data.policies || [];
    } catch (error) {
      console.error('Error loading policies:', error);
      this.policies = [];
    }
  }

  private savePolicies() {
    try {
      const data = { policies: this.policies };
      const tomlString = stringify(data as unknown as Record<string, unknown>);
      writeFileSync(this.filePath, tomlString);
    } catch (error) {
      console.error('Error saving policies:', error);
    }
  }

  getPolicies(): Policy[] {
    return this.policies;
  }

  addPolicy(policy: Omit<Policy, 'status'>): Policy {
    const newPolicy: Policy = {
      ...policy,
      status: 'inactive'
    };
    
    this.policies.push(newPolicy);
    this.savePolicies();
    return newPolicy;
  }

  updatePolicyStatus(name: string, status: 'active' | 'inactive'): Policy | null {
    const policy = this.policies.find(p => p.name === name);
    if (policy) {
      policy.status = status;
      this.savePolicies();
      return policy;
    }
    return null;
  }

  deletePolicy(name: string): boolean {
    const index = this.policies.findIndex(p => p.name === name);
    if (index !== -1) {
      this.policies.splice(index, 1);
      this.savePolicies();
      return true;
    }
    return false;
  }
}
