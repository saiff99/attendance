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
  // Keep max 5 toasts visible at once
  toastsState = [newItem, ...toastsState.slice(0, 4)];
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
      className="fixed bottom-4 right-4 z-[9999] sm:bottom-6 sm:right-6 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
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
            className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl backdrop-blur-xl shadow-2xl border transition-all duration-300 animate-in slide-in-from-bottom-3 fade-in ${
              isSuccess
                ? "bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-emerald-950/40"
                : isError
                ? "bg-slate-900/95 border-rose-500/40 text-slate-100 shadow-rose-950/40"
                : isWarning
                ? "bg-slate-900/95 border-amber-500/40 text-slate-100 shadow-amber-950/40"
                : "bg-slate-900/95 border-indigo-500/40 text-slate-100 shadow-indigo-950/40"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {isError && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {isInfo && <Info className="w-5 h-5 text-indigo-400" />}
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <p className="text-xs sm:text-sm font-medium leading-relaxed break-words">
                {t.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleDismiss(t.id)}
              className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
