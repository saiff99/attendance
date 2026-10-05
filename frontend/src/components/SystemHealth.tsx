"use client";

import { useEffect, useState } from "react";

// Global cache across page navigations in the SPA
let cachedIsOnline: boolean | null = null;
let lastCheckTimestamp = 0;
const listeners = new Set<(status: boolean | null) => void>();

function notifyListeners(status: boolean | null) {
  cachedIsOnline = status;
  lastCheckTimestamp = Date.now();
  listeners.forEach((listener) => listener(status));
}

export function SystemHealth() {
  const [isOnline, setIsOnline] = useState<boolean | null>(() => cachedIsOnline);

  useEffect(() => {
    // Register listener for status updates
    const listener = (status: boolean | null) => {
      setIsOnline(status);
    };
    listeners.add(listener);

    let isChecking = false;

    const checkHealth = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch("/api/health", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json().catch(() => null);
          const online = data?.status === "ok" || data?.online === true;
          notifyListeners(online);
          isChecking = false;
          return;
        }
      } catch {
        // Backend offline / fetch failed
      } finally {
        isChecking = false;
      }

      notifyListeners(false);
    };

    // Immediate check on component mount
    checkHealth();

    // Fast polling when offline or starting up (1.5s), normal interval when healthy (10s)
    let timerId: NodeJS.Timeout;
    const scheduleNextCheck = () => {
      const delay = cachedIsOnline === true ? 10000 : 1500;
      timerId = setTimeout(async () => {
        await checkHealth();
        scheduleNextCheck();
      }, delay);
    };

    scheduleNextCheck();

    // Trigger instant check when tab/window becomes active or network recovers
    const onFocusOrOnline = () => {
      checkHealth();
    };
    window.addEventListener("focus", onFocusOrOnline);
    window.addEventListener("online", onFocusOrOnline);

    return () => {
      listeners.delete(listener);
      clearTimeout(timerId);
      window.removeEventListener("focus", onFocusOrOnline);
      window.removeEventListener("online", onFocusOrOnline);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 transition-colors">
      <div className="relative flex h-3 w-3">
        {isOnline === true && (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </>
        )}
        {isOnline === false && (
          <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
        )}
        {isOnline === null && (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
          </>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {isOnline === true
            ? "System Online"
            : isOnline === false
            ? "System Offline"
            : "Checking Status..."}
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          {isOnline === true
            ? "Backend AI Engine Connected"
            : isOnline === false
            ? "Backend Disconnected"
            : "Connecting to AI Engine"}
        </span>
      </div>
    </div>
  );
}
