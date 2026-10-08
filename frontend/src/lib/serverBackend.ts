import { supabase } from '@/lib/supabase';

const CLOUDFLARE_TUNNEL = "";
const NGROK_TUNNEL = "";

let cachedTunnelUrl: string | null = null;
let lastCacheTime = 0;

export async function getLiveTunnelUrl(): Promise<string | null> {
  const now = Date.now();
  // Cache for 10 seconds to minimize Supabase query overhead
  if (cachedTunnelUrl && now - lastCacheTime < 10000) {
    return cachedTunnelUrl;
  }
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('instructor_name')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .single();

    if (!error && data?.instructor_name && data.instructor_name.startsWith('http')) {
      cachedTunnelUrl = data.instructor_name.trim();
      lastCacheTime = now;
      return cachedTunnelUrl;
    }
  } catch (err) {
    console.warn('[serverBackend] Failed to fetch live tunnel URL from Supabase:', err);
  }
  return cachedTunnelUrl;
}

export function getServerBackendUrl(): string {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL;
  }
  if (process.env.NEXT_PUBLIC_BACKEND_URL && !process.env.NEXT_PUBLIC_BACKEND_URL.includes("localhost") && !process.env.NEXT_PUBLIC_BACKEND_URL.includes("127.0.0.1")) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  return "http://127.0.0.1:8000";
}

export async function fetchBackend(path: string, options: RequestInit = {}): Promise<Response> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const isHealthCheck = normalizedPath === '/health';
  const isCloudEnvironment = Boolean(process.env.VERCEL || (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_LOCAL_DEV));
  
  const headers = new Headers(options.headers || {});
  headers.set('ngrok-skip-browser-warning', '69420');

  // Fast-Path: When running locally on Mac/PC, ALWAYS check localhost directly (1ms instant response!)
  if (!isCloudEnvironment) {
    try {
      const localTimeout = isHealthCheck ? 3000 : 45000;
      const ctrl = new AbortController();
      const tId = setTimeout(() => ctrl.abort(), localTimeout);
      const localRes = await fetch(`http://127.0.0.1:8000${normalizedPath}`, {
        ...options,
        headers,
        signal: options.signal || ctrl.signal,
      });
      clearTimeout(tId);
      if (localRes.ok || (localRes.status >= 400 && localRes.status < 500)) {
        return localRes;
      }
    } catch {
      // Localhost not ready or busy, fallback to dynamic tunnel / remote targets
    }
  }

  // Candidate URLs to try in priority order:
  const targets: string[] = [];

  // Live dynamic tunnel URL synced from Mac via Supabase (for Vercel / Remote access)
  const liveDynamicTunnel = await getLiveTunnelUrl();
  if (liveDynamicTunnel && !targets.includes(liveDynamicTunnel)) {
    targets.push(liveDynamicTunnel);
  }

  const primaryUrl = getServerBackendUrl();
  if (primaryUrl && !targets.includes(primaryUrl)) {
    targets.push(primaryUrl);
  }

  if (!targets.includes("http://127.0.0.1:8000")) {
    targets.push("http://127.0.0.1:8000");
  }

  let lastError: any = null;

  for (const baseUrl of targets) {
    try {
      const isLocal = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost");
      // Use reasonable timeout for health checks, 45s for deep AI face analysis
      const timeoutMs = isHealthCheck ? (isLocal ? 4000 : 6000) : 45000;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      
      const res = await fetch(`${baseUrl}${normalizedPath}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });
      clearTimeout(timeout);

      // If response is good or valid application error (400, 401, 403, 404, 422), return it
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }

      // Otherwise try next fallback tunnel
    } catch (err: any) {
      lastError = err;
      if (!isHealthCheck) {
        console.warn(`[fetchBackend] Connection to ${baseUrl}${normalizedPath} failed:`, err.message);
      }
    }
  }

  if (lastError) throw lastError;
  return new Response(JSON.stringify({ detail: 'Backend AI server unreachable.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

