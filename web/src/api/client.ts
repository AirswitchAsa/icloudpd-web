import type { ApiErrorBody } from "@/types/api";

export class ApiError extends Error {
  readonly errorId: string | null;
  readonly field: string | null;
  readonly status: number;

  constructor(message: string, status: number, errorId: string | null, field: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorId = errorId;
    this.field = field;
  }
}

export interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    credentials: "include",
    signal: opts.signal,
    headers: {
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  const response = await fetch(path, init);
  const contentType = response.headers.get("Content-Type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    if (isJson) {
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = null;
      }
    }
    throw new ApiError(
      body?.error ?? response.statusText ?? `HTTP ${response.status}`,
      response.status,
      body?.error_id ?? null,
      body?.field ?? null
    );
  }

  if (response.status === 204) return undefined as T;
  if (!isJson) return (await response.text()) as T;
  return (await response.json()) as T;
}
