import { supabaseServer } from '@/lib/supabaseServer';
import crypto from 'crypto';

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

/**
 * Constant-time comparison between two hex string signatures to prevent timing attacks.
 */
function constantTimeHexEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA.length !== cleanB.length) return false;

  try {
    const bufA = Buffer.from(cleanA, 'hex');
    const bufB = Buffer.from(cleanB, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    let diff = 0;
    for (let i = 0; i < cleanA.length; i++) {
      diff |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
    }
    return diff === 0;
  }
}

/**
 * Computes HMAC-SHA256 signature in hex for the given URL string.
 */
function computeHmacSha256(key: string, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Validates, authenticates, and sanitizes a tunnel URL:
 * 1. Validates URL structure and scheme (must be https for remote tunnels, http only for localhost).
 * 2. Enforces strict domain allowlist.
 * 3. Enforces mandatory cryptographic HMAC signature for all remote tunnel targets.
 * 4. Rejects unsigned, improperly signed, or missing-secret remote URLs.
 */
export async function verifyAndSanitizeTunnelUrl(
  rawUrl: string,
  explicitSig?: string
): Promise<string | null> {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  try {
    let cleanUrl = rawUrl.trim();
    let signature = explicitSig ? explicitSig.trim() : '';

    // If signature is appended via URL hash fragment (#sig=...)
    if (cleanUrl.includes('#sig=')) {
      const parts = cleanUrl.split('#sig=');
      cleanUrl = parts[0].trim();
      if (!signature && parts[1]) {
        signature = parts[1].trim();
      }
    }

    // Parse URL components
    const urlObj = new URL(cleanUrl);
    const hostname = urlObj.hostname.toLowerCase();
    const protocol = urlObj.protocol.toLowerCase();

    // 1. Local Loopback Exception (for direct local dev & testing)
    const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost';
    if (isLoopback) {
      if (protocol !== 'http:' && protocol !== 'https:') {
        console.warn(`[Security Alert] Rejected invalid protocol for loopback: ${protocol}`);
        return null;
      }
      return cleanUrl;
    }

    // 2. Strict Scheme Enforcement: Remote tunnels MUST use HTTPS
    if (protocol !== 'https:') {
      console.warn(`[Security Alert] Rejected insecure non-HTTPS remote tunnel protocol: ${protocol} (${cleanUrl})`);
      return null;
    }

    // 3. Strict Domain Allowlist Enforcement
    const isDomainAllowed = ALLOWED_TUNNEL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isDomainAllowed) {
      console.warn(`[Security Alert] Rejected untrusted tunnel host: ${hostname}`);
      return null;
    }

    // 4. Mandatory Cryptographic HMAC Signature Verification for Remote Tunnels
    // In any deployed/remote environment, signature and internal key are non-negotiable.
    const internalKey = getInternalApiKey();
    if (!internalKey) {
      console.error('[Security Alert] Rejecting remote tunnel URL because INTERNAL_API_KEY is not configured on this server.');
      return null;
    }

    if (!signature) {
      console.warn(`[Security Alert] Rejected remote tunnel URL without required HMAC signature: ${cleanUrl}`);
      return null;
    }

    const expectedSig = computeHmacSha256(internalKey, cleanUrl);
    if (!constantTimeHexEqual(signature, expectedSig)) {
      console.warn(`[Security Alert] HMAC signature verification failed for tunnel URL: ${cleanUrl}`);
      return null;
    }

    return cleanUrl;
  } catch (err) {
    console.warn('[serverBackend] Failed to parse tunnel URL:', err);
    return null;
  }
}

/**
 * Fetches the live tunnel URL:
 * 1. Preferred Enterprise Pattern: Reads from dedicated 'settings' table (key = 'tunnel_config').
 * 2. Backward Compatibility: Falls back to legacy 'sessions' table row (id = '00000000-0000-0000-0000-000000000000').
 * Authenticates and caches the verified URL for 10 seconds.
 */
export async function getLiveTunnelUrl(): Promise<string | null> {
  const now = Date.now();
  if (cachedTunnelUrl && now - lastCacheTime < 10000) {
    return cachedTunnelUrl;
  }

  try {
    // 1. Primary: Dedicated settings table
    const { data: settingRow, error: settingErr } = await supabaseServer
      .from('settings')
      .select('value')
      .eq('key', 'tunnel_config')
      .maybeSingle();

    if (!settingErr && settingRow?.value) {
      const val = settingRow.value;
      const candidateUrl = typeof val === 'string' ? val : (val.signed_url || val.url);
      const candidateSig = typeof val === 'object' ? val.signature : undefined;
      if (candidateUrl) {
        const verified = await verifyAndSanitizeTunnelUrl(candidateUrl, candidateSig);
        if (verified) {
          cachedTunnelUrl = verified;
          lastCacheTime = now;
          return cachedTunnelUrl;
        }
      }
    }

    // 2. Backward Compatibility: Special sessions row
    const { data: sessionRow, error: sessionErr } = await supabaseServer
      .from('sessions')
      .select('instructor_name')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();

    if (!sessionErr && sessionRow?.instructor_name && sessionRow.instructor_name.startsWith('http')) {
      const verified = await verifyAndSanitizeTunnelUrl(sessionRow.instructor_name.trim());
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
  if (
    process.env.NEXT_PUBLIC_BACKEND_URL &&
    !process.env.NEXT_PUBLIC_BACKEND_URL.includes('localhost') &&
    !process.env.NEXT_PUBLIC_BACKEND_URL.includes('127.0.0.1')
  ) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  return 'http://127.0.0.1:8000';
}

export async function fetchBackend(path: string, options: RequestInit = {}): Promise<Response> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const isHealthCheck = normalizedPath === '/health';
  const isVercelCloud = Boolean(process.env.VERCEL);
  const internalApiKey = getInternalApiKey();

  // Fast-Path: When running on local host, direct localhost check (1ms instant response!)
  if (!isVercelCloud) {
    try {
      const localTimeout = isHealthCheck ? 2000 : 45000;
      const ctrl = new AbortController();
      const tId = setTimeout(() => ctrl.abort(), localTimeout);

      const localHeaders = new Headers(options.headers || {});
      localHeaders.set('ngrok-skip-browser-warning', '69420');
      if (internalApiKey) {
        localHeaders.set('X-Internal-API-Key', internalApiKey);
      }

      const localRes = await fetch(`http://127.0.0.1:8000${normalizedPath}`, {
        ...options,
        headers: localHeaders,
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

  // Candidate verified targets to try in priority order:
  const verifiedTargets: string[] = [];

  if (!isVercelCloud) {
    verifiedTargets.push('http://127.0.0.1:8000');
  }

  // Live dynamic tunnel URL synced from Mac via Supabase (for Vercel / Remote access)
  // getLiveTunnelUrl() enforces strict signature, scheme, and domain verification!
  const liveDynamicTunnel = await getLiveTunnelUrl();
  if (liveDynamicTunnel && !verifiedTargets.includes(liveDynamicTunnel)) {
    verifiedTargets.push(liveDynamicTunnel);
  }

  const primaryUrl = getServerBackendUrl();
  if (primaryUrl && !verifiedTargets.includes(primaryUrl)) {
    const verifiedPrimary = await verifyAndSanitizeTunnelUrl(primaryUrl);
    if (verifiedPrimary && !verifiedTargets.includes(verifiedPrimary)) {
      verifiedTargets.push(verifiedPrimary);
    }
  }

  if (!verifiedTargets.includes('http://127.0.0.1:8000') && !isVercelCloud) {
    verifiedTargets.push('http://127.0.0.1:8000');
  }

  let lastError: any = null;

  for (const baseUrl of verifiedTargets) {
    try {
      const isLoopback = baseUrl.includes('127.0.0.1') || baseUrl.includes('localhost');
      
      // Strict Security: Only forward internal API key to verified loopback or verified dynamic tunnel
      const reqHeaders = new Headers(options.headers || {});
      reqHeaders.set('ngrok-skip-browser-warning', '69420');
      if (internalApiKey && (isLoopback || baseUrl === liveDynamicTunnel)) {
        reqHeaders.set('X-Internal-API-Key', internalApiKey);
      }

      const timeoutMs = isHealthCheck ? (isLoopback ? 4000 : 6000) : 45000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${baseUrl}${normalizedPath}`, {
        ...options,
        headers: reqHeaders,
        signal: options.signal || controller.signal,
      });
      clearTimeout(timeout);

      // If response is good or valid application error (400, 401, 403, 404, 422, 500), return it
      if (res.ok || res.status >= 400) {
        return res;
      }
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
