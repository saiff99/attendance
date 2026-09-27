export function getBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL && process.env.NEXT_PUBLIC_BACKEND_URL !== "http://localhost:8000") {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const protocol = window.location.protocol;

    // If accessed via localhost on HTTP (Mac local testing)
    if ((host === "localhost" || host === "127.0.0.1") && protocol === "http:") {
      return "http://localhost:8000";
    }

    // When on HTTPS (e.g. mobile Safari, Vercel, or local HTTPS) route to secure HTTPS ngrok tunnel
    // This prevents Safari/WebKit from blocking mixed content (insecure HTTP fetch on HTTPS page -> "Load failed")
    if (protocol === "https:" || host.includes("vercel.app") || host.includes("ngrok")) {
      return "https://silly-unframed-extortion.ngrok-free.dev";
    }

    return `http://${host}:8000`;
  }
  return "http://localhost:8000";
}

