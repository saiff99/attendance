import { supabase } from '@/lib/supabase';

const CLOUDFLARE_TUNNEL = "https://reader-thee-nevertheless-walked.trycloudflare.com";
const NGROK_TUNNEL = "https://silly-unframed-extortion.ngrok-free.dev";

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
  // When running on Vercel or cloud production, default to Cloudflare's unlimited bandwidth tunnel
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return CLOUDFLARE_TUNNEL;
  }
  return "http://127.0.0.1:8000";
}

export async function fetchBackend(path: string, options: RequestInit = {}): Promise<Response> {
  const liveDynamicTunnel = await getLiveTunnelUrl();
  const primaryUrl = getServerBackendUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  const headers = new Headers(options.headers || {});
  headers.set('ngrok-skip-browser-warning', '69420');

  // Candidate URLs to try in priority order:
  // 1. Live dynamic tunnel URL synced from Mac via Supabase (always newest & active)
  // 2. Primary URL / Cloudflare fallback
  // 3. Ngrok tunnel fallback
  // 4. Localhost
  const targets: string[] = [];
  if (liveDynamicTunnel && !targets.includes(liveDynamicTunnel)) {
    targets.push(liveDynamicTunnel);
  }
  if (primaryUrl && !targets.includes(primaryUrl)) {
    targets.push(primaryUrl);
  }
  if (CLOUDFLARE_TUNNEL && !targets.includes(CLOUDFLARE_TUNNEL)) {
    targets.push(CLOUDFLARE_TUNNEL);
  }
  if (NGROK_TUNNEL && !targets.includes(NGROK_TUNNEL)) {
    targets.push(NGROK_TUNNEL);
  }
  if (!targets.includes("http://127.0.0.1:8000")) {
    targets.push("http://127.0.0.1:8000");
  }

  let lastError: any = null;

  for (const baseUrl of targets) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      
      const res = await fetch(`${baseUrl}${normalizedPath}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });
      clearTimeout(timeout);

      // If response is good or valid application error (400, 401, 403, 404, 422), return it
      // Only retry alternative tunnel if there is a proxy/quota failure (502, 503, 504, or ngrok 403 quota)
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 403)) {
        return res;
      }

      // Check if 403 is an ngrok bandwidth quota error
      if (res.status === 403) {
        const text = await res.clone().text().catch(() => '');
        if (!text.includes('ERR_NGROK_725') && !text.includes('bandwidth limit')) {
          return res; // Real application 403, return it
        }
      }

      // Otherwise try next fallback tunnel
    } catch (err: any) {
      lastError = err;
      console.warn(`[fetchBackend] Connection to ${baseUrl}${normalizedPath} failed:`, err.message);
    }
  }

  if (lastError) throw lastError;
  return new Response(JSON.stringify({ detail: 'Backend AI server unreachable.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

