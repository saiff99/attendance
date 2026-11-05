"use client";

import { useEffect, useRef } from "react";

export interface UseModalBehaviorOptions {
  isOpen: boolean;
  onClose: () => void;
  modalRef?: React.RefObject<HTMLElement | null>;
  disableEscape?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

// Track active modal count to safely manage body scroll lock across stacked modals
let activeModalsCount = 0;
let previousBodyOverflow = "";

export function useModalBehavior({
  isOpen,
  onClose,
  modalRef,
  disableEscape = false,
  initialFocusRef,
}: UseModalBehaviorOptions) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // 1. Scroll Lock
  useEffect(() => {
    if (!isOpen) return;

    if (activeModalsCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    activeModalsCount++;

    return () => {
      activeModalsCount = Math.max(0, activeModalsCount - 1);
      if (activeModalsCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
    };
  }, [isOpen]);

  // 2. Escape Key Dismiss
  useEffect(() => {
    if (!isOpen || disableEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, disableEscape, onClose]);

  // 3. Focus Management & Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore later
    if (document.activeElement instanceof HTMLElement) {
      previousActiveElementRef.current = document.activeElement;
    }

    const container = modalRef?.current;

    // Initial focus
    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (container) {
        const focusable = container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          container.focus();
        }
      }
    }, 40);

    // Trap Tab and Shift+Tab key navigation
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => {
        // In browser, offsetParent is null only for display:none elements.
        // In jsdom environment, offsetParent is always null, so check styles / visibility.
        if (typeof el.offsetParent !== "undefined" && el.offsetParent !== null) {
          return true;
        }
        return el.style.display !== "none" && el.style.visibility !== "hidden" && el.getAttribute("aria-hidden") !== "true";
      });

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement || !container.contains(document.activeElement)) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement || !container.contains(document.activeElement)) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleTabKey);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleTabKey);
      if (
        previousActiveElementRef.current &&
        document.body.contains(previousActiveElementRef.current)
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, modalRef, initialFocusRef]);
}
