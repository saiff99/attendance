export function getBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL && process.env.NEXT_PUBLIC_BACKEND_URL !== "http://localhost:8000") {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    const host = window.location.hostname;
    // When hosted on Vercel or public domains, route to permanent ngrok tunnel
    if (host.includes("vercel.app") || host.includes("ngrok")) {
      return "https://silly-unframed-extortion.ngrok-free.dev";
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8000";
    }
    return `http://${host}:8000`;
  }
  return "http://localhost:8000";
}
