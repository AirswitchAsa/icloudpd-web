import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { useAuthStatus, useLogin } from "@/hooks/useAuth";

const server = setupServer(
  http.get("*/auth/status", () =>
    HttpResponse.json({ authenticated: false, auth_required: true })
  ),
  http.post("*/auth/login", async ({ request }) => {
    const body = (await request.json()) as { password: string };
    if (body.password === "good") return HttpResponse.json({ ok: true });
    return HttpResponse.json(
      { error: "Invalid password", error_id: null, field: "password" },
      { status: 401 }
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useAuthStatus", () => {
  it("returns backend status", async () => {
    const { result } = renderHook(() => useAuthStatus(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ authenticated: false, auth_required: true });
  });
});

describe("useLogin", () => {
  it("succeeds on correct password", async () => {
    const { result } = renderHook(() => useLogin(), { wrapper: wrapper() });
    await result.current.mutateAsync("good");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("fails on wrong password", async () => {
    const { result } = renderHook(() => useLogin(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync("bad")).rejects.toMatchObject({
      field: "password",
    });
  });
});
