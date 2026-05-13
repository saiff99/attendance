"use client";

import { useEffect, useState } from "react";

export function SystemHealth() {
  const [isOnline, setIsOnline] = useState<boolean>(true); // Optimistic initial state

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
        // Fast timeout fetch to check if the API is responding
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sec timeout
        
        const response = await fetch(`${backendUrl}/docs`, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "ngrok-skip-browser-warning": "69420"
          }
        });
        clearTimeout(timeoutId);
        setIsOnline(response.ok);
      } catch (error) {
        setIsOnline(false);
      }
    };

    // Initial check
    checkHealth();

    // Poll every 10 seconds
    const intervalId = setInterval(checkHealth, 10000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
      <div className="relative flex h-3 w-3">
        {isOnline ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </>
        ) : (
          <>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {isOnline ? "System Online" : "System Offline"}
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          {isOnline ? "CCTV Tracking Active" : "Backend Disconnected"}
        </span>
      </div>
    </div>
  );
}
