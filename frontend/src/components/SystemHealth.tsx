"use client";

import { useEffect, useState } from "react";

export function SystemHealth() {
  const [isOnline, setIsOnline] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const response = await fetch("/api/health", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json().catch(() => null);
          if (isMounted) {
            setIsOnline(data?.status === "ok" || data?.online === true);
          }
          return;
        }
      } catch {
        // Backend offline / fetch failed
      }

      if (isMounted) {
        setIsOnline(false);
      }
    };

    // Initial check
    checkHealth();

    // Poll every 8 seconds
    const intervalId = setInterval(checkHealth, 8000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 transition-colors">
      <div className="relative flex h-3 w-3">
        {isOnline ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </>
        ) : (
          <>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {isOnline ? "System Online" : "System Offline"}
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          {isOnline ? "Backend AI Engine Connected" : "Backend Disconnected"}
        </span>
      </div>
    </div>
  );
}
