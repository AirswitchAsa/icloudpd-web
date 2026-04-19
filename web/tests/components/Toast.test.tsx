import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastStack } from "@/components/Toast";
import { pushError, useToastStore } from "@/store/toastStore";

describe("ToastStack", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("renders error toast with error id", async () => {
    render(<ToastStack />);
    pushError("Boom", "srv-1");
    expect(await screen.findByText("Boom")).toBeInTheDocument();
    expect(screen.getByText(/Error ID: srv-1/)).toBeInTheDocument();
  });

  it("dismisses on click", async () => {
    render(<ToastStack />);
    pushError("Boom");
    const btn = await screen.findByRole("button", { name: "Dismiss" });
    await userEvent.click(btn);
    expect(screen.queryByText("Boom")).not.toBeInTheDocument();
  });
});
