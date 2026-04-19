import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { EditPolicyModal } from "@/components/EditPolicyModal";

let lastUpsert: Record<string, unknown> | null = null;
let lastPassword: string | null = null;

const server = setupServer(
  http.put("*/policies/:name", async ({ request }) => {
    lastUpsert = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...(lastUpsert as Record<string, unknown>),
      is_running: false,
      has_password: false,
    });
  }),
  http.post("*/policies/:name/password", async ({ request }) => {
    const body = (await request.json()) as { password: string };
    lastPassword = body.password;
    return new HttpResponse(null, { status: 204 });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  lastUpsert = null;
  lastPassword = null;
});
afterAll(() => server.close());

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("EditPolicyModal", () => {
  it("creates a new policy and sets password", async () => {
    render(
      <Wrap>
        <EditPolicyModal open onClose={() => {}} initial={null} />
      </Wrap>
    );
    await userEvent.type(screen.getByLabelText("Name"), "fam");
    await userEvent.type(screen.getByLabelText("iCloud username"), "me@icloud.com");
    await userEvent.type(screen.getByLabelText("Directory"), "/data/fam");
    await userEvent.type(screen.getByLabelText(/iCloud password/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect((lastUpsert as Record<string, unknown>)?.name).toBe("fam");
      expect((lastUpsert as Record<string, unknown>)?.username).toBe("me@icloud.com");
      expect(lastPassword).toBe("secret");
    });
  });
});
