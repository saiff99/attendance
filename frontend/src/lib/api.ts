export function getBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL && process.env.NEXT_PUBLIC_BACKEND_URL !== "http://localhost:8000") {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  // Use same-origin relative endpoints ("") for all client requests
  // Next.js API routes (/api/*) securely proxy to FastAPI on localhost or Ngrok
  // This eliminates CORS errors, SSL mixed-content blocks, and ngrok interstitial warnings across all domains!
  return "";
}
