"use client";

import { useEffect, useState } from "react";

export function SystemHealth() {
  const [isOnline, setIsOnline] = useState<boolean>(true); // Optimistic initial state

  useEffect(() => {
    const checkHealth = async () => {
      const candidates: string[] = [];
      
      // 1. Configured Backend URL from environment
      if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        candidates.push(process.env.NEXT_PUBLIC_BACKEND_URL);
      }
      
      // 2. Localhost standard port
      candidates.push("http://localhost:8000");

      // 3. Ngrok tunnel fallback
      candidates.push("https://silly-unframed-extortion.ngrok-free.dev");

      // Filter duplicates
      const uniqueUrls = Array.from(new Set(candidates));

      let connected = false;

      for (const url of uniqueUrls) {
        // Skip http localhost if page is loaded over https (mixed content prevention)
        if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("http://")) {
          continue;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);

          const response = await fetch(`${url}/health`, {
            method: "GET",
            signal: controller.signal,
            headers: {
              "ngrok-skip-browser-warning": "true"
            }
          });
          
          clearTimeout(timeoutId);

          if (response.ok) {
            connected = true;
            break;
          }
        } catch {
          // Try next candidate
        }
      }

      setIsOnline(connected);
    };

    // Initial check
    checkHealth();

    // Poll every 8 seconds
    const intervalId = setInterval(checkHealth, 8000);
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
          {isOnline ? "Backend AI Engine Connected" : "Backend Disconnected"}
        </span>
      </div>
    </div>
  );
}
