import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/hooks/useAuth";
import { ApiError } from "@/api/client";

export function LoginScreen() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync(password);
      setPassword("");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Login failed");
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">icloudpd-web</h1>
        <label className="block">
          <span className="text-sm text-slate-700">Password</span>
          <Input
            type="password"
            autoFocus
            value={password}
            invalid={error !== null}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="text-sm text-danger">{error}</div>}
        <Button type="submit" disabled={login.isPending || password.length === 0}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
