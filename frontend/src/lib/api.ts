export function getBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL && process.env.NEXT_PUBLIC_BACKEND_URL !== "http://localhost:8000") {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;

    // When running locally on Mac or local Wi-Fi (localhost, 127.0.0.1, or local subnet 172.16.x / 192.168.x / 10.x)
    // Use same-origin relative endpoints ("") which are proxied locally by Next.js to FastAPI on port 8000
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("172.") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.")
    ) {
      return "";
    }

    // When deployed on Vercel or cloud HTTPS, route to the secure public ngrok tunnel
    if (host.includes("vercel.app") || host.includes("ngrok")) {
      return "https://silly-unframed-extortion.ngrok-free.dev";
    }

    return "";
  }
  return "http://localhost:8000";
}
