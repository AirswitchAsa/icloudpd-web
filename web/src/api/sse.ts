type Handler = (data: unknown, lastEventId: string) => void;

export interface SseSubscription {
  close(): void;
}

export interface SseOptions {
  onError?: (e: Event) => void;
}

export function subscribeEvents(
  url: string,
  handlers: Record<string, Handler>,
  opts: SseOptions = {}
): SseSubscription {
  const source = new EventSource(url, { withCredentials: true });
  const wrapped: Record<string, (e: MessageEvent) => void> = {};

  for (const [name, fn] of Object.entries(handlers)) {
    wrapped[name] = (event) => {
      let parsed: unknown = event.data;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        /* raw string */
      }
      fn(parsed, event.lastEventId);
    };
    source.addEventListener(name, wrapped[name]);
  }

  if (opts.onError) {
    source.onerror = opts.onError;
  }

  return {
    close() {
      for (const [name, fn] of Object.entries(wrapped)) {
        source.removeEventListener(name, fn);
      }
      source.close();
    },
  };
}
