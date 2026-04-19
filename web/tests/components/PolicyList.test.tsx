import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PolicyList } from "@/components/PolicyList";
import type { PolicyView } from "@/types/api";

const base: PolicyView = {
  name: "p",
  username: "u@icloud.com",
  directory: "/tmp/p",
  cron: "0 * * * *",
  enabled: true,
  icloudpd: {},
  notifications: { on_start: false, on_success: true, on_failure: true },
  aws: null,
  is_running: false,
  has_password: true,
  next_run_at: null,
  last_run: null,
};

function noop() {}

describe("PolicyList", () => {
  it("shows empty state", () => {
    render(
      <PolicyList
        policies={[]}
        onCreate={noop}
        onRun={noop}
        onStop={noop}
        onEdit={noop}
        onDelete={noop}
        onHistory={noop}
        onOpenActiveRun={noop}
      />
    );
    expect(screen.getByText(/No policies yet/i)).toBeInTheDocument();
  });

  it("renders row and fires Run handler", async () => {
    const onRun = vi.fn();
    render(
      <PolicyList
        policies={[base]}
        onCreate={noop}
        onRun={onRun}
        onStop={noop}
        onEdit={noop}
        onDelete={noop}
        onHistory={noop}
        onOpenActiveRun={noop}
      />
    );
    expect(screen.getByText("p")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onRun).toHaveBeenCalledWith(base);
  });

  it("shows Stop/View when running", () => {
    render(
      <PolicyList
        policies={[{ ...base, is_running: true }]}
        onCreate={noop}
        onRun={noop}
        onStop={noop}
        onEdit={noop}
        onDelete={noop}
        onHistory={noop}
        onOpenActiveRun={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
  });

  it("disables Run when no password set", () => {
    render(
      <PolicyList
        policies={[{ ...base, has_password: false }]}
        onCreate={noop}
        onRun={noop}
        onStop={noop}
        onEdit={noop}
        onDelete={noop}
        onHistory={noop}
        onOpenActiveRun={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });
});
