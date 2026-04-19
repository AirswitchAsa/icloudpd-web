export interface PolicyNotifications {
  on_start: boolean;
  on_success: boolean;
  on_failure: boolean;
}

export interface PolicyAwsConfig {
  bucket: string;
  prefix?: string;
  region?: string;
  access_key_id?: string;
  secret_access_key?: string;
}

export interface Policy {
  name: string;
  username: string;
  directory: string;
  cron: string;
  enabled: boolean;
  timezone?: string | null;
  icloudpd: Record<string, unknown>;
  notifications: PolicyNotifications;
  aws: PolicyAwsConfig | null;
}

export type RunStatus =
  | "running"
  | "awaiting_mfa"
  | "success"
  | "failed"
  | "stopped";

export interface RunSummary {
  run_id: string;
  policy_name: string;
  status: RunStatus;
  started_at: string;
  ended_at?: string | null;
  exit_code?: number | null;
  error_id?: string | null;
  downloaded?: number;
  total?: number;
}

export interface PolicyView extends Policy {
  is_running: boolean;
  next_run_at?: string | null;
  last_run?: RunSummary | null;
  has_password: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  auth_required: boolean;
}

export interface AppSettings {
  apprise: { urls: string[]; on_start: boolean; on_success: boolean; on_failure: boolean };
  retention_runs: number;
}

export interface ApiErrorBody {
  error: string;
  error_id: string | null;
  field: string | null;
}
