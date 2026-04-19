import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/api/auth";

export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth", "status"],
    queryFn: authApi.status,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => authApi.login(password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "status"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.clear();
      qc.invalidateQueries({ queryKey: ["auth", "status"] });
    },
  });
}
