function getAuthSecret(): string {
  const secret = (process.env.AUTH_SECRET || process.env.JWT_SECRET || '').trim();
  if (secret.length >= 16) {
    return secret;
  }
  throw new Error('FATAL SECURITY ERROR: AUTH_SECRET environment variable is missing or insecure. Configure AUTH_SECRET in your environment variables.');
}


export const SESSION_COOKIE_NAME = 'medattend_session';

export interface SessionPayload {
  username: string;
  name: string;
  role: 'Super Admin' | 'Admin' | 'Faculty' | 'Student';
  department?: string;
  studentId?: string;
  studentRoll?: string;
  academicYear?: string;
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
  maxAgeSeconds = 36000 // 10 hours
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

/**
 * Extract and verify SessionPayload directly from incoming Request or NextRequest.
 */
export async function getSessionFromRequest(request: Request | any): Promise<SessionPayload | null> {
  try {
    // 1. If NextRequest with cookies API
    if (request && typeof request.cookies?.get === 'function') {
      const cookieVal = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (cookieVal) return verifySessionToken(cookieVal);
    }

    // 2. Fallback to standard cookie header
    const rawHeader = request?.headers?.get?.('cookie') || '';
    if (rawHeader) {
      const match = rawHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) {
        return verifySessionToken(decodeURIComponent(match[1]));
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Enforce role authorization for API routes.
 */
export async function requireRoles(
  request: Request | any,
  allowedRoles: ('Super Admin' | 'Admin' | 'Faculty' | 'Student')[]
): Promise<{ user: SessionPayload; errorResponse?: never } | { user?: never; errorResponse: any }> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      errorResponse: {
        status: 401,
        body: { success: false, error: 'Unauthorized: Authentication session required.' }
      }
    };
  }
  if (!allowedRoles.includes(session.role)) {
    return {
      errorResponse: {
        status: 403,
        body: { success: false, error: 'Forbidden: Insufficient role permissions.' }
      }
    };
  }
  return { user: session };
}
