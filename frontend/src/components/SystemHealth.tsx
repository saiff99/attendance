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

    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

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
          return;
        }
      } catch {
        // Backend offline / fetch failed
      }

      notifyListeners(false);
    };

    // If we haven't checked in the last 6 seconds or state is null, perform check
    if (cachedIsOnline === null || Date.now() - lastCheckTimestamp > 6000) {
      checkHealth();
    }

    // Poll every 8 seconds
    const intervalId = setInterval(checkHealth, 8000);

    return () => {
      listeners.delete(listener);
      clearInterval(intervalId);
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
