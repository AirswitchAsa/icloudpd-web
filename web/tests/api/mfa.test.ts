import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mfaApi } from "@/api/mfa";

const origFetch = globalThis.fetch;

describe("mfaApi", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("uses POST for submit", async () => {
    await mfaApi.submit("p", "123456");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/policies/p/mfa",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "123456" }),
      })
    );
  });
});
