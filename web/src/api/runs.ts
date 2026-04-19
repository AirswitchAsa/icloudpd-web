import { apiFetch } from "./client";
import type { RunSummary } from "@/types/api";

export const runsApi = {
  start: (policyName: string) =>
    apiFetch<{ run_id: string }>(
      `/policies/${encodeURIComponent(policyName)}/runs`,
      { method: "POST" }
    ),
  stop: (runId: string) => apiFetch<void>(`/runs/${runId}`, { method: "DELETE" }),
  history: (policyName: string) =>
    apiFetch<RunSummary[]>(`/policies/${encodeURIComponent(policyName)}/runs`),
  logUrl: (runId: string) => `/runs/${runId}/log`,
};
