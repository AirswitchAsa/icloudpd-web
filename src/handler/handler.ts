import { IPty, spawn } from 'node-pty';
import * as TOML from '@iarna/toml';
import * as fs from 'fs';
import * as path from 'path';

interface PolicySpec {
  id: string;
  username: string;
  directory: string;
  syncMode: 'download' | 'sync';
  interval?: number;
}

class PolicyHandler {
  private activePolicies: Map<string, IPty> = new Map();
  private policySpecs: Map<string, PolicySpec> = new Map();


  private loadPolicySpecs() {
    const policyDir = path.join(process.cwd(), 'policies');
    if (!fs.existsSync(policyDir)) {
      fs.mkdirSync(policyDir);
    }
    // Load policy specs from TOML files
  }

  private handleCreatePolicy(policySpec: PolicySpec) {
    // Create new policy spec and save to TOML
  }

  private handleStartPolicy(id: string, password: string) {
    // Start icloudpd process with the given policy
  }

  private handleStopPolicy(id: string) {
    // Stop the running policy process
  }

  private handleGetPolicies() {
    // Return list of policy specs
  }
}

export default PolicyHandler;
