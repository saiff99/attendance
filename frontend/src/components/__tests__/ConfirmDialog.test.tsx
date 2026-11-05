import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { confirmDialog, ConfirmDialogProvider } from "../ConfirmDialog";

describe("ConfirmDialog component & helper", () => {
  it("renders confirmation modal when confirmDialog is called", async () => {
    render(<ConfirmDialogProvider />);

    act(() => {
      void confirmDialog({
        title: "End Live Session",
        message: "Are you sure you want to end this attendance session?",
        confirmText: "End Session",
        variant: "danger",
      });
    });

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("End Live Session")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to end this attendance session?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End Session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("resolves to true when confirm button is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogProvider />);

    let promiseResult: boolean | null = null;
    act(() => {
      confirmDialog({
        title: "Conclude",
        message: "Confirm action?",
        confirmText: "Yes",
      }).then((res) => {
        promiseResult = res;
      });
    });

    const confirmBtn = screen.getByRole("button", { name: "Yes" });
    await user.click(confirmBtn);

    expect(promiseResult).toBe(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("resolves to false when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogProvider />);

    let promiseResult: boolean | null = null;
    act(() => {
      confirmDialog({
        title: "Conclude",
        message: "Confirm action?",
        cancelText: "No Keep It",
      }).then((res) => {
        promiseResult = res;
      });
    });

    const cancelBtn = screen.getByRole("button", { name: "No Keep It" });
    await user.click(cancelBtn);

    expect(promiseResult).toBe(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
