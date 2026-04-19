import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { SettingsModal } from "@/components/SettingsModal";

let current = {
  apprise: { urls: ["pover://token"], on_start: false, on_success: true, on_failure: true },
  retention_runs: 10,
};

const server = setupServer(
  http.get("*/settings", () => HttpResponse.json(current)),
  http.put("*/settings", async ({ request }) => {
    current = (await request.json()) as typeof current;
    return HttpResponse.json(current);
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("SettingsModal", () => {
  it("edits retention and saves", async () => {
    render(
      <Wrap>
        <SettingsModal open onClose={() => {}} />
      </Wrap>
    );
    const input = await screen.findByLabelText(/retention/i);
    await userEvent.clear(input);
    await userEvent.type(input, "25");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(current.retention_runs).toBe(25));
  });
});
