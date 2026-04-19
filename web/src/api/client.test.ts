import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./client";

function mockFetch(response: { status?: number; headers?: Record<string, string>; body: string }) {
  const status = response.status ?? 200;
  const headers = new Headers(response.headers ?? {});
  // Use a plain object mock to avoid jsdom's Response rejecting 204/etc.
  const r = {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers,
    json: async () => JSON.parse(response.body) as unknown,
    text: async () => response.body,
  };
  vi.stubGlobal("fetch", vi.fn(async () => r));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch success paths", () => {
  it("returns parsed JSON for 200", async () => {
    mockFetch({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    const result = await apiFetch<{ ok: boolean }>("/x");
    expect(result).toEqual({ ok: true });
  });

  it("returns undefined for 204", async () => {
    mockFetch({
      status: 204,
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    const result = await apiFetch("/x");
    expect(result).toBeUndefined();
  });

  it("returns text body when Content-Type is not JSON", async () => {
    mockFetch({
      status: 200,
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });
    const result = await apiFetch<string>("/x");
    expect(result).toBe("hello");
  });
});

describe("apiFetch error paths", () => {
  it("throws ApiError with parsed body for JSON error response", async () => {
    mockFetch({
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Invalid cron",
        error_id: "srv-deadbeef",
        field: "cron",
      }),
    });
    await expect(apiFetch("/x")).rejects.toMatchObject({
      name: "ApiError",
      message: "Invalid cron",
      status: 400,
      errorId: "srv-deadbeef",
      field: "cron",
    });
  });

  it("falls back to statusText when error body is not JSON", async () => {
    mockFetch({
      status: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Internal Server Error",
    });
    const err = await apiFetch("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(500);
    expect(apiErr.errorId).toBeNull();
    expect(apiErr.field).toBeNull();
  });
});
