import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import type { AppSettings } from "@/types/api";

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: AppSettings) => settingsApi.put(settings),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}
