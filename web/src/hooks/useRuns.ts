import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runsApi } from "@/api/runs";

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyName: string) => runsApi.start(policyName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

export function useStopRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => runsApi.stop(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

export function useRunHistory(policyName: string | null) {
  return useQuery({
    queryKey: ["runs", "history", policyName],
    queryFn: () => runsApi.history(policyName!),
    enabled: policyName !== null,
  });
}
