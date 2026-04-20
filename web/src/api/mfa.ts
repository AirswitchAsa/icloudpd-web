import { apiFetch } from "./client";

export const mfaApi = {
  submit: (policyName: string, code: string) =>
    apiFetch<{ ok: boolean }>(
      `/policies/${encodeURIComponent(policyName)}/mfa`,
      { method: "POST", body: { code } }
    ),
};
