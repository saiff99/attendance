export function getBackendUrl(): string {
  // Always use same-origin relative endpoints ("") for all client requests
  // Next.js API routes (/api/*) securely proxy to FastAPI on localhost or Ngrok
  // This completely eliminates CORS errors, SSL mixed-content blocks, and ngrok interstitial warnings across all domains!
  return "";
}

