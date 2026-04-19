import { apiFetch } from "./client";

export const mfaApi = {
  status: (policyName: string) =>
    apiFetch<{ awaiting: boolean }>(
      `/policies/${encodeURIComponent(policyName)}/mfa/status`
    ),
  submit: (policyName: string, code: string) =>
    apiFetch<{ ok: boolean }>(
      `/policies/${encodeURIComponent(policyName)}/mfa`,
      { method: "POST", body: { code } }
    ),
};
