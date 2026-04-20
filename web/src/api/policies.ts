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
  discoverLibraries: (name: string) =>
    apiFetch<{ libraries: string[] }>(
      `/policies/${encodeURIComponent(name)}/libraries/discover`,
      { method: "POST" }
    ),
  exportUrl: () => "/policies/export",
  importToml: async (
    toml: string
  ): Promise<{
    created: string[];
    errors: { name: string | null; error: string }[];
  }> => {
    const res = await fetch("/policies/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/toml" },
      body: toml,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error ?? `Import failed (${res.status})`);
    }
    return data;
  },
};
