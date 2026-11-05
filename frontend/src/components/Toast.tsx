"use client";

import React, { useCallback, useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

type ToastListener = () => void;

let toastsState: ToastItem[] = [];
const listeners: Set<ToastListener> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function addToast(type: ToastType, message: string, duration = 4000) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newItem: ToastItem = { id, type, message, duration };
  // Keep max 4 toasts visible at once
  toastsState = [newItem, ...toastsState.slice(0, 3)];
  notifyListeners();

  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }
  return id;
}

function dismissToast(id: string) {
  toastsState = toastsState.filter((t) => t.id !== id);
  notifyListeners();
}

export const toast = {
  success: (message: string, duration?: number) => addToast("success", message, duration),
  error: (message: string, duration?: number) => addToast("error", message, duration ?? 5000),
  warning: (message: string, duration?: number) => addToast("warning", message, duration),
  info: (message: string, duration?: number) => addToast("info", message, duration),
  dismiss: (id: string) => dismissToast(id),
};

function subscribe(callback: ToastListener) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot() {
  return toastsState;
}

export function ToastContainer() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const handleDismiss = useCallback((id: string) => {
    dismissToast(id);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[9999] sm:bottom-6 sm:right-6 flex flex-col items-end gap-2 pointer-events-none px-3 sm:px-0"
    >
      {toasts.map((t) => {
        const isError = t.type === "error";
        const isSuccess = t.type === "success";
        const isWarning = t.type === "warning";
        const isInfo = t.type === "info";

        return (
          <div
            key={t.id}
            role={isError ? "alert" : "status"}
            className={`pointer-events-auto inline-flex items-center gap-2.5 py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-xl border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-2 fade-in max-w-[340px] sm:max-w-[380px] shadow-[0_12px_32px_-4px_rgba(0,0,0,0.85)] ${
              isSuccess
                ? "bg-[#0E1E1D] border-emerald-500/50 text-slate-100 ring-1 ring-emerald-500/30"
                : isError
                ? "bg-[#231219] border-rose-500/50 text-slate-100 ring-1 ring-rose-500/30"
                : isWarning
                ? "bg-[#231B10] border-amber-500/50 text-slate-100 ring-1 ring-amber-500/30"
                : "bg-[#12192B] border-indigo-500/50 text-slate-100 ring-1 ring-indigo-500/30"
            }`}
          >
            {/* Status Icon Badge */}
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${
                isSuccess
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : isError
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                  : isWarning
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
              }`}
            >
              {isSuccess && <CheckCircle2 className="w-3.5 h-3.5" />}
              {isError && <AlertCircle className="w-3.5 h-3.5" />}
              {isWarning && <AlertTriangle className="w-3.5 h-3.5" />}
              {isInfo && <Info className="w-3.5 h-3.5" />}
            </div>

            {/* Message */}
            <div className="min-w-0 pr-1">
              <p className="text-xs sm:text-[13px] font-semibold leading-snug text-slate-100 truncate sm:whitespace-normal">
                {t.message}
              </p>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => handleDismiss(t.id)}
              className="shrink-0 p-1 ml-auto rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
