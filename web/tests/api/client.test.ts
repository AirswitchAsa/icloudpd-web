import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError } from "@/api/client";

const origFetch = globalThis.fetch;

describe("apiFetch", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns JSON body on 2xx", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ hello: "world" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const got = await apiFetch<{ hello: string }>("/x");
    expect(got).toEqual({ hello: "world" });
  });

  it("throws ApiError with backend shape on non-2xx", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "nope", error_id: "srv-1", field: "name" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );
    await expect(apiFetch("/x")).rejects.toMatchObject({
      message: "nope",
      errorId: "srv-1",
      field: "name",
      status: 400,
    });
  });

  it("throws ApiError with status-text fallback on non-JSON error", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("oops", { status: 500, statusText: "Internal Server Error" })
    );
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("sends credentials and JSON body on POST", async () => {
    const spy = vi.fn().mockResolvedValueOnce(
      new Response("null", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    await apiFetch("/y", { method: "POST", body: { a: 1 } });
    expect(spy).toHaveBeenCalledWith(
      "/y",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ a: 1 }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });
});
