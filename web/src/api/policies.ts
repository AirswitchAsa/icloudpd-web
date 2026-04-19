import { apiFetch } from "./client";
import type { Policy, PolicyView } from "@/types/api";

export const policiesApi = {
  list: () => apiFetch<PolicyView[]>("/policies"),
  get: (name: string) => apiFetch<PolicyView>(`/policies/${encodeURIComponent(name)}`),
  upsert: (name: string, policy: Policy) =>
    apiFetch<PolicyView>(`/policies/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: policy,
    }),
  remove: (name: string) =>
    apiFetch<void>(`/policies/${encodeURIComponent(name)}`, { method: "DELETE" }),
  setPassword: (name: string, password: string) =>
    apiFetch<void>(`/policies/${encodeURIComponent(name)}/password`, {
      method: "POST",
      body: { password },
    }),
  clearPassword: (name: string) =>
    apiFetch<void>(`/policies/${encodeURIComponent(name)}/password`, { method: "DELETE" }),
};
