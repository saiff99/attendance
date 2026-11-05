import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useModalBehavior } from "../useModalBehavior";

describe("useModalBehavior hook", () => {
  let originalOverflow: string;

  beforeEach(() => {
    originalOverflow = document.body.style.overflow;
  });

  afterEach(() => {
    document.body.style.overflow = originalOverflow;
    vi.restoreAllMocks();
  });

  it("locks document.body overflow when modal is open and restores when closed", () => {
    const onClose = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ isOpen }) => useModalBehavior({ isOpen, onClose }),
      { initialProps: { isOpen: true } }
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender({ isOpen: false });
    expect(document.body.style.overflow).toBe("");

    rerender({ isOpen: true });
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();

    renderHook(() => useModalBehavior({ isOpen: true, onClose }));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when Escape key is pressed if disableEscape is true", () => {
    const onClose = vi.fn();

    renderHook(() => useModalBehavior({ isOpen: true, onClose, disableEscape: true }));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps focus between first and last focusable elements inside container", () => {
    const onClose = vi.fn();
    const container = document.createElement("div");
    const btn1 = document.createElement("button");
    const btn2 = document.createElement("button");

    container.appendChild(btn1);
    container.appendChild(btn2);
    document.body.appendChild(container);

    const modalRef = { current: container };

    renderHook(() => useModalBehavior({ isOpen: true, onClose, modalRef }));

    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    // Tab on last element should cycle to first element
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    window.dispatchEvent(tabEvent);

    expect(document.activeElement).toBe(btn1);

    document.body.removeChild(container);
  });
});

