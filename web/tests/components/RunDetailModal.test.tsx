import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { RunDetailModal } from "@/components/RunDetailModal";
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
  emit(type: string, data: unknown, id = "1") {
    const e = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id });
    (this.listeners[type] || []).forEach((fn) => fn(e));
  }
}

const server = setupServer();

beforeAll(() => {
  server.listen();
  (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource =
    FakeEventSource;
});
afterAll(() => {
  server.close();
  delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
});
beforeEach(() => useRunStore.setState({ runs: {} }));
afterEach(() => server.resetHandlers());

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("RunDetailModal", () => {
  it("renders log lines and progress", () => {
    render(
      <Wrap>
        <RunDetailModal open runId="r1" policyName="p1" onClose={() => {}} />
      </Wrap>
    );
    act(() => {
      FakeEventSource.last!.emit("log", { line: "downloading..." });
      FakeEventSource.last!.emit("progress", { downloaded: 1, total: 4 });
    });
    expect(screen.getByText("downloading...")).toBeInTheDocument();
    expect(screen.getByText("1 / 4 (25%)")).toBeInTheDocument();
  });

  it("shows MFA modal when status flips to awaiting_mfa", () => {
    render(
      <Wrap>
        <RunDetailModal open runId="r1" policyName="p1" onClose={() => {}} />
      </Wrap>
    );
    act(() => {
      FakeEventSource.last!.emit("status", { status: "awaiting_mfa" });
    });
    expect(screen.getByText(/Two-factor code/i)).toBeInTheDocument();
  });
});
