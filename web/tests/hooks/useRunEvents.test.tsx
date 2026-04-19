import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRunEvents } from "@/hooks/useRunEvents";
import { useRunStore } from "@/store/runStore";

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
  emit(type: string, data: unknown, id = "") {
    const e = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id });
    (this.listeners[type] || []).forEach((fn) => fn(e));
  }
}

beforeAll(() => {
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource =
    FakeEventSource;
});
afterAll(() => {
  delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
});
beforeEach(() => useRunStore.setState({ runs: {} }));

function wrapper() {
  const client = new QueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useRunEvents", () => {
  it("appends log, updates progress, flips status", () => {
    renderHook(() => useRunEvents("r1", "p1"), { wrapper: wrapper() });
    const es = FakeEventSource.last!;
    act(() => {
      es.emit("log", { line: "hello" }, "1");
      es.emit("progress", { downloaded: 2, total: 5 });
      es.emit("status", { status: "success" });
    });
    const run = useRunStore.getState().runs["r1"];
    expect(run.logs).toEqual([{ seq: 1, line: "hello" }]);
    expect(run.downloaded).toBe(2);
    expect(run.total).toBe(5);
    expect(run.status).toBe("success");
  });
});
