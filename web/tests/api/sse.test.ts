import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { subscribeEvents } from "@/api/sse";

class FakeEventSource {
  url: string;
  withCredentials: boolean;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  static last: FakeEventSource | null = null;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((x) => x !== fn);
  }
  close() {
    this.closed = true;
  }
  dispatch(type: string, data: unknown, lastEventId?: string) {
    const event = new MessageEvent(type, {
      data: typeof data === "string" ? data : JSON.stringify(data),
      lastEventId: lastEventId ?? "",
    });
    (this.listeners[type] || []).forEach((fn) => fn(event));
  }
}

describe("subscribeEvents", () => {
  beforeEach(() => {
    (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource =
      FakeEventSource;
  });
  afterEach(() => {
    delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
  });

  it("routes named events to handlers and tracks last-event-id", () => {
    const onLog = vi.fn();
    const onStatus = vi.fn();
    const sub = subscribeEvents("/runs/abc/events", {
      log: onLog,
      status: onStatus,
    });
    FakeEventSource.last!.dispatch("log", { line: "hi" }, "1");
    FakeEventSource.last!.dispatch("status", { status: "success" }, "2");
    expect(onLog).toHaveBeenCalledWith({ line: "hi" }, "1");
    expect(onStatus).toHaveBeenCalledWith({ status: "success" }, "2");
    sub.close();
    expect(FakeEventSource.last!.closed).toBe(true);
  });

  it("passes credentials flag to EventSource", () => {
    subscribeEvents("/policies/stream", {});
    expect(FakeEventSource.last!.withCredentials).toBe(true);
  });

  it("invokes onError when source errors", () => {
    const onError = vi.fn();
    subscribeEvents("/x", {}, { onError });
    const err = new Event("error");
    FakeEventSource.last!.onerror?.(err);
    expect(onError).toHaveBeenCalled();
  });
});
