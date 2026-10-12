import { supabase } from '@/lib/supabase';

const CLOUDFLARE_TUNNEL = "";
const NGROK_TUNNEL = "";

let cachedTunnelUrl: string | null = null;
let lastCacheTime = 0;

function getInternalApiKey(): string {
  return (process.env.INTERNAL_API_KEY || '').trim();
}

// Allowed trusted tunnel domains
const ALLOWED_TUNNEL_DOMAINS = [
  'trycloudflare.com',
  'ngrok-free.app',
  'ngrok.io',
  'loca.lt',
  'localhost',
  '127.0.0.1',
];

async function computeHmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data) as unknown as BufferSource);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyAndSanitizeTunnelUrl(rawUrl: string): Promise<string | null> {
  if (!rawUrl || !rawUrl.startsWith('http')) return null;

  try {
    const [baseUrl, sigPart] = rawUrl.split('#sig=');
    const cleanUrl = baseUrl.trim();
    const urlObj = new URL(cleanUrl);

    // 1. Strict Domain Whitelist Check
    const hostname = urlObj.hostname.toLowerCase();
    const isDomainAllowed = ALLOWED_TUNNEL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isDomainAllowed) {
      console.warn(`[Security Alert] Rejected untrusted tunnel host: ${hostname}`);
      return null;
    }

    // 2. Cryptographic HMAC Signature Verification (if signature is attached)
    if (sigPart) {
      const internalKey = getInternalApiKey();
      if (internalKey) {
        const expectedSig = await computeHmacSha256Hex(internalKey, cleanUrl);
        if (sigPart.trim() !== expectedSig) {
          console.warn(`[Security Alert] HMAC signature mismatch for tunnel URL: ${cleanUrl}`);
          return null;
        }
      }
    }

    return cleanUrl;
  } catch (err) {
    console.warn('[serverBackend] Failed to parse tunnel URL:', err);
    return null;
  }
}

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
      const verified = await verifyAndSanitizeTunnelUrl(data.instructor_name.trim());
      if (verified) {
        cachedTunnelUrl = verified;
        lastCacheTime = now;
        return cachedTunnelUrl;
      }
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
  const isVercelCloud = Boolean(process.env.VERCEL);
  
  const headers = new Headers(options.headers || {});
  headers.set('ngrok-skip-browser-warning', '69420');
  const internalApiKey = getInternalApiKey();
  if (internalApiKey) {
    headers.set('X-Internal-API-Key', internalApiKey);
  }

  // Fast-Path: When running on local machine (MacBook / Codespaces / Self-hosted), ALWAYS check localhost directly (1ms instant response!)
  if (!isVercelCloud) {
    try {
      const localTimeout = isHealthCheck ? 2000 : 45000;
      const ctrl = new AbortController();
      const tId = setTimeout(() => ctrl.abort(), localTimeout);
      const localRes = await fetch(`http://127.0.0.1:8000${normalizedPath}`, {
        ...options,
        headers,
        signal: options.signal || ctrl.signal,
      });
      clearTimeout(tId);
      if (localRes.ok || localRes.status >= 400) {
        return localRes;
      }
    } catch {
      // Localhost not ready or busy, fallback to dynamic tunnel / remote targets
    }
  }

  // Candidate URLs to try in priority order:
  const targets: string[] = [];

  if (!isVercelCloud) {
    targets.push("http://127.0.0.1:8000");
  }

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

      // If response is good or valid application error (400, 401, 403, 404, 422, 500), return it
      if (res.ok || res.status >= 400) {
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

