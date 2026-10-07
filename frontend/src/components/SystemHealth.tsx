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
    let consecutiveFailures = 0;

    const checkHealth = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        
        // On localhost, probe port 8000 directly for 0.5ms instant response
        if (isLocalHost) {
          try {
            const directCtrl = new AbortController();
            const directTimeout = setTimeout(() => directCtrl.abort(), 2000);
            const directRes = await fetch("http://127.0.0.1:8000/health", {
              method: "GET",
              signal: directCtrl.signal,
              cache: "no-store",
            });
            clearTimeout(directTimeout);
            if (directRes.ok) {
              const directData = await directRes.json().catch(() => null);
              if (directData?.status === "ok" || directData?.status === "Online") {
                consecutiveFailures = 0;
                notifyListeners(true);
                isChecking = false;
                return;
              }
            }
          } catch {
            // Direct fetch fallback to /api/health
          }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch("/api/health", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json().catch(() => null);
          const online = data?.status === "ok" || data?.online === true;
          if (online) {
            consecutiveFailures = 0;
            notifyListeners(true);
            isChecking = false;
            return;
          }
        }
      } catch {
        // Backend offline / fetch timed out
      } finally {
        isChecking = false;
      }

      consecutiveFailures += 1;
      // Only mark offline if failed 3 consecutive times to avoid false alarms during AI spikes
      if (consecutiveFailures >= 3) {
        notifyListeners(false);
      }
    };

    // Immediate check on component mount
    checkHealth();

    // Regular stable polling interval: 15s when online, 5s when offline
    let timerId: NodeJS.Timeout;
    const scheduleNextCheck = () => {
      const delay = cachedIsOnline === true ? 15000 : 5000;
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
