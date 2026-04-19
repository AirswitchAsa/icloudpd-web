import { apiFetch } from "./client";
import type { AuthStatus } from "@/types/api";

export const authApi = {
  status: () => apiFetch<AuthStatus>("/auth/status"),
  login: (password: string) =>
    apiFetch<{ ok: boolean }>("/auth/login", { method: "POST", body: { password } }),
  logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
};
