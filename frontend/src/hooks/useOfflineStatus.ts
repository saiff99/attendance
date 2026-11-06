import { useState, useEffect } from "react";

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof window !== "undefined" ? navigator.onLine : true;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  return {
    isOnline,
  };
}

