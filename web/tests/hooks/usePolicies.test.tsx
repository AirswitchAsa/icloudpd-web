import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { usePolicies, usePoliciesLiveUpdate } from "@/hooks/usePolicies";

let callCount = 0;
const server = setupServer(
  http.get("*/policies", () => {
    callCount += 1;
    return HttpResponse.json([
      {
        name: "p",
        username: "u@icloud.com",
        directory: "/tmp/p",
        cron: "0 * * * *",
        enabled: true,
        icloudpd: {},
        aws: null,
        is_running: false,
        has_password: false,
      },
    ]);
  })
);

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  close() {}
  dispatch(type: string) {
    const e = new MessageEvent(type, { data: JSON.stringify({ generation: 2 }) });
    (this.listeners[type] || []).forEach((fn) => fn(e));
  }
}

beforeAll(() => {
  server.listen();
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource =
    FakeEventSource;
});
afterEach(() => {
  server.resetHandlers();
  callCount = 0;
});
afterAll(() => {
  server.close();
  delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("usePolicies + usePoliciesLiveUpdate", () => {
  it("fetches and re-fetches on SSE generation event", async () => {
    const W = wrapper();
    const { result } = renderHook(
      () => {
        usePoliciesLiveUpdate(true);
        return usePolicies();
      },
      { wrapper: W }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callCount).toBe(1);

    act(() => {
      FakeEventSource.last!.dispatch("generation");
    });

    await waitFor(() => expect(callCount).toBe(2));
  });
});
