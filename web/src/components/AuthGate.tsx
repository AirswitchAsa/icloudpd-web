import type { ReactNode } from "react";
import { useAuthStatus } from "@/hooks/useAuth";
import { LoginScreen } from "./LoginScreen";

export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useAuthStatus();

  if (isLoading) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }
  if (isError || !data) {
    return <div className="p-8 text-danger">Cannot reach server.</div>;
  }
  if (!data.authenticated) {
    return <LoginScreen />;
  }
  return <>{children}</>;
}
