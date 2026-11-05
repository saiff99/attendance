import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import { toast, ToastContainer } from "../Toast";

describe("Toast component & dispatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders success toast message when triggered", async () => {
    render(<ToastContainer />);

    await act(async () => {
      toast.success("Attendance marked successfully!");
    });

    expect(screen.getByText("Attendance marked successfully!")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders error toast with alert role", async () => {
    render(<ToastContainer />);

    await act(async () => {
      toast.error("Network timeout occurred");
    });

    expect(screen.getByText("Network timeout occurred")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("auto-dismisses toast after duration", async () => {
    render(<ToastContainer />);

    await act(async () => {
      toast.info("Temporary notification", 1000);
    });

    expect(screen.getByText("Temporary notification")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(screen.queryByText("Temporary notification")).not.toBeInTheDocument();
  });
});
