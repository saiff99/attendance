export function getServerBackendUrl(): string {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL;
  }
  if (process.env.NEXT_PUBLIC_BACKEND_URL && !process.env.NEXT_PUBLIC_BACKEND_URL.includes("localhost") && !process.env.NEXT_PUBLIC_BACKEND_URL.includes("127.0.0.1")) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  // When running on Vercel or cloud production, route directly to the active tunnel
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return "https://silly-unframed-extortion.ngrok-free.dev";
  }
  return "http://127.0.0.1:8000";
}

export async function fetchBackend(path: string, options: RequestInit = {}): Promise<Response> {
  const primaryUrl = getServerBackendUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  const headers = new Headers(options.headers || {});
  headers.set('ngrok-skip-browser-warning', '69420');

  // Try primary target
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    
    const res = await fetch(`${primaryUrl}${normalizedPath}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    // If primary failed (e.g. local 127.0.0.1 was down or unreachable), fallback to the tunnel URL
    if (primaryUrl !== "https://silly-unframed-extortion.ngrok-free.dev") {
      const fallbackUrl = "https://silly-unframed-extortion.ngrok-free.dev";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      
      const res = await fetch(`${fallbackUrl}${normalizedPath}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });
      clearTimeout(timeout);
      return res;
    }
    throw err;
  }
}
