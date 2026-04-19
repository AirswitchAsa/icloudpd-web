import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";

let auth = { authenticated: false, auth_required: true };
const server = setupServer(
  http.get("*/auth/status", () => HttpResponse.json(auth)),
  http.post("*/auth/login", async ({ request }) => {
    const body = (await request.json()) as { password: string };
    if (body.password === "good") {
      auth = { authenticated: true, auth_required: true };
      return HttpResponse.json({ ok: true });
    }
    return HttpResponse.json(
      { error: "Invalid password", error_id: null, field: "password" },
      { status: 401 }
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  auth = { authenticated: false, auth_required: true };
});
afterAll(() => server.close());

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("AuthGate + LoginScreen", () => {
  it("shows login when unauthenticated, signs in and renders children", async () => {
    render(
      <Wrap>
        <AuthGate>
          <div>app content</div>
        </AuthGate>
      </Wrap>
    );
    await screen.findByText("Sign in");
    await userEvent.type(screen.getByLabelText("Password"), "good");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText("app content")).toBeInTheDocument());
  });

  it("skips login in passwordless mode", async () => {
    auth = { authenticated: true, auth_required: false };
    render(
      <Wrap>
        <AuthGate>
          <div>app content</div>
        </AuthGate>
      </Wrap>
    );
    expect(await screen.findByText("app content")).toBeInTheDocument();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
  });

  it("displays server error on bad password", async () => {
    render(
      <Wrap>
        <AuthGate>
          <div>app content</div>
        </AuthGate>
      </Wrap>
    );
    await screen.findByText("Sign in");
    await userEvent.type(screen.getByLabelText("Password"), "bad");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText("Invalid password")).toBeInTheDocument());
  });
});
