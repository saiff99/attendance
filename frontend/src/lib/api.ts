export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }
  }
  // When running in production (e.g. Vercel / newshuge.com), use same-origin relative proxy
  return "";
}

export function getVideoBackendUrl(cameraIndex: number = 0): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      // Shard connections across localhost and 127.0.0.1 so Chrome's 6-connection per host limit is never exhausted
      return cameraIndex % 2 === 0 ? "http://localhost:8000" : "http://127.0.0.1:8000";
    }
  }
  return "";
}

