import { useState, useEffect, useCallback } from "react";

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof window !== "undefined" ? navigator.onLine : true;
  });

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window !== "undefined") {
      return "Notification" in window ? Notification.permission : "unsupported";
    }
    return "default";
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

  const requestNotificationAccess = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === "granted" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification("MedAttend AI", {
          body: "Attendance alerts enabled! You will receive live check-in notifications.",
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
        });
      }
    } catch (e) {
      console.warn("Notification permission error:", e);
    }
  }, []);

  return {
    isOnline,
    notificationPermission,
    requestNotificationAccess,
  };
}
