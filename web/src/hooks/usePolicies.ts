import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { policiesApi } from "@/api/policies";
import { subscribeEvents } from "@/api/sse";
import type { Policy, PolicyView } from "@/types/api";

const LIST_KEY = ["policies"] as const;

export function usePolicies() {
  return useQuery({ queryKey: LIST_KEY, queryFn: policiesApi.list });
}

export function usePolicy(name: string | null) {
  return useQuery({
    queryKey: ["policies", name],
    queryFn: () => policiesApi.get(name!),
    enabled: name !== null,
  });
}

export function useUpsertPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, policy }: { name: string; policy: Policy }) =>
      policiesApi.upsert(name, policy),
    onSuccess: (updated: PolicyView) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.setQueryData(["policies", updated.name], updated);
    },
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => policiesApi.remove(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useSetPolicyPassword() {
  return useMutation({
    mutationFn: ({ name, password }: { name: string; password: string }) =>
      policiesApi.setPassword(name, password),
  });
}

export function usePoliciesLiveUpdate(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const sub = subscribeEvents("/policies/stream", {
      generation: () => {
        qc.invalidateQueries({ queryKey: LIST_KEY });
      },
    });
    return () => sub.close();
  }, [enabled, qc]);
}
