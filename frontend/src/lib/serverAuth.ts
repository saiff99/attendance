// Cryptographically secure ephemeral fallback key for local dev if AUTH_SECRET is not configured
let runtimeDevSecret: string | null = null;
function getAuthSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim().length >= 16) {
    return process.env.AUTH_SECRET.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('[SECURITY CRITICAL] AUTH_SECRET environment variable is missing in production!');
  }
  if (!runtimeDevSecret) {
    runtimeDevSecret = `dev_sec_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
  }
  return runtimeDevSecret;
}

export const SESSION_COOKIE_NAME = 'medattend_session';

export interface SessionPayload {
  username: string;
  name: string;
  role: 'Super Admin' | 'Faculty';
  exp: number; // Expiration timestamp in seconds
}

// Convert string to Uint8Array
function stringToUint8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Convert ArrayBuffer to URL-safe base64
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Decode URL-safe base64 to string
function base64UrlToString(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = stringToUint8(secret);
  return await crypto.subtle.importKey(
    'raw',
    enc as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(
  payload: Omit<SessionPayload, 'exp'>,
  maxAgeSeconds = 2592000 // 30 days
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const fullPayload: SessionPayload = { ...payload, exp };
  
  const payloadStr = JSON.stringify(fullPayload);
  const payloadB64 = btoa(payloadStr)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const key = await getCryptoKey(getAuthSecret());
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    stringToUint8(payloadB64) as unknown as BufferSource
  );
  const sigB64 = bufferToBase64Url(signatureBuffer);

  return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token || !token.includes('.')) return null;

  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;

    // Convert sigB64 back to Uint8Array
    const binarySig = base64UrlToString(sigB64);
    const sigBytes = new Uint8Array(binarySig.length);
    for (let i = 0; i < binarySig.length; i++) {
      sigBytes[i] = binarySig.charCodeAt(i);
    }

    const key = await getCryptoKey(getAuthSecret());
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      stringToUint8(payloadB64) as unknown as BufferSource
    );

    if (!isValid) return null;

    const payloadJson = base64UrlToString(payloadB64);
    const payload: SessionPayload = JSON.parse(payloadJson);

    // Check expiration
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSeconds) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
