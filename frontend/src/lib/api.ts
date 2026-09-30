export function getBackendUrl(): string {
  // When running locally in browser, connect directly to FastAPI backend on port 8000
  // This completely frees up Next.js (port 3000) connection pool so 6-camera live scan never blocks page navigation (e.g. Student Directory, Dashboard)!
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }
  }
  // When running in production (e.g. Vercel / newshuge.com), use same-origin relative proxy
  return "";
}

