"use client";

import React, { useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
}

interface ActiveDialog extends ConfirmDialogOptions {
  id: string;
  resolve: (value: boolean) => void;
}

type DialogListener = () => void;

let currentDialog: ActiveDialog | null = null;
const dialogListeners: Set<DialogListener> = new Set();

function notifyDialogListeners() {
  dialogListeners.forEach((listener) => listener());
}

/**
 * Modern non-blocking replacement for window.confirm()
 * Returns a Promise that resolves to true (Confirmed) or false (Cancelled)
 */
export function confirmDialog(options: ConfirmDialogOptions | string): Promise<boolean> {
  const normalized: ConfirmDialogOptions =
    typeof options === "string" ? { message: options } : options;

  return new Promise<boolean>((resolve) => {
    // If a dialog is already open, resolve the previous one as false
    if (currentDialog) {
      currentDialog.resolve(false);
    }

    currentDialog = {
      ...normalized,
      id: `dialog-${Date.now()}`,
      resolve: (value: boolean) => {
        currentDialog = null;
        notifyDialogListeners();
        resolve(value);
      },
    };

    notifyDialogListeners();
  });
}

function subscribe(callback: DialogListener) {
  dialogListeners.add(callback);
  return () => {
    dialogListeners.delete(callback);
  };
}

function getSnapshot() {
  return currentDialog;
}

export function ConfirmDialogProvider() {
  const dialog = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Lock background scrolling and handle Escape key while dialog is active
  useEffect(() => {
    if (!dialog) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Auto-focus confirm button
    const timer = setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dialog.resolve(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [dialog]);

  const handleConfirm = useCallback(() => {
    if (dialog) dialog.resolve(true);
  }, [dialog]);

  const handleCancel = useCallback(() => {
    if (dialog) dialog.resolve(false);
  }, [dialog]);

  if (!dialog) return null;

  const isDanger = dialog.variant === "danger" || !dialog.variant;
  const isWarning = dialog.variant === "warning";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 select-none"
      onClick={handleCancel}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-Right Dismiss Button */}
        <button
          type="button"
          onClick={handleCancel}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close confirmation dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon + Title */}
        <div className="flex items-start gap-3.5 mb-3">
          <div
            className={`p-2.5 rounded-2xl shrink-0 ${
              isDanger
                ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                : isWarning
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
            }`}
          >
            {isDanger && <AlertTriangle className="w-6 h-6" />}
            {isWarning && <AlertCircle className="w-6 h-6" />}
            {!isDanger && !isWarning && <Info className="w-6 h-6" />}
          </div>

          <div className="min-w-0 pr-6">
            <h3 id="confirm-dialog-title" className="text-base sm:text-lg font-bold text-white tracking-tight">
              {dialog.title || "Confirmation Required"}
            </h3>
          </div>
        </div>

        {/* Message */}
        <p
          id="confirm-dialog-message"
          className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line mb-6 pl-1"
        >
          {dialog.message}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80 transition-colors cursor-pointer"
          >
            {dialog.cancelText || "Cancel"}
          </button>

          <button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md cursor-pointer ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                : isWarning
                ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30"
                : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30"
            }`}
          >
            {dialog.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
