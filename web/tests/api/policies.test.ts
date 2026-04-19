import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { policiesApi } from "@/api/policies";

const origFetch = globalThis.fetch;

describe("policiesApi", () => {
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

  it("url-encodes policy names with special characters", async () => {
    await policiesApi.get("has space");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/policies/has%20space",
      expect.any(Object)
    );
  });

  it("sends PUT with body for upsert", async () => {
    const policy = {
      name: "p",
      username: "u@icloud.com",
      directory: "/tmp/p",
      cron: "0 * * * *",
      enabled: true,
      icloudpd: {},
      notifications: { on_start: false, on_success: true, on_failure: true },
      aws: null,
      filters: {
        file_suffixes: [],
        match_patterns: [],
        device_makes: [],
        device_models: [],
      },
    };
    await policiesApi.upsert("p", policy);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/policies/p",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(policy),
      })
    );
  });

  it("uses POST for setPassword", async () => {
    await policiesApi.setPassword("p", "secret");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/policies/p/password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "secret" }),
      })
    );
  });

  it("uses DELETE for clearPassword", async () => {
    await policiesApi.clearPassword("p");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/policies/p/password",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
