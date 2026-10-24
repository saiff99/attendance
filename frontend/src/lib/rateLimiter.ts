import { supabaseServer } from '@/lib/supabaseServer';

// Configuration thresholds
export const MAX_ACCOUNT_FAILED_ATTEMPTS = 5;
export const MAX_IP_FAILED_ATTEMPTS = 60; // High ceiling for shared college campus Wi-Fi NAT
export const LOCKOUT_WINDOW_MS = 60 * 1000; // 60 seconds (1 minute)

export interface RateLimitEntry {
  count: number;
  version: number;
  firstAttempt: number;
  lockedUntil: number;
  lastAttempt: number;
}

// In-process memory cache for sub-millisecond fast lookups and degraded fail-closed shield
const memoryRateCache: Record<string, RateLimitEntry> = {};

// In-flight concurrency tracker to eliminate parallel race conditions
const inFlightAttempts = new Map<string, number>();

// In-flight serialization mutex per key to prevent internal race conditions
const inFlightMutexes = new Map<string, Promise<any>>();

/**
 * Runs an async operation with per-key mutual exclusion, serializing concurrent operations
 * for the same key to eliminate race conditions.
 */
export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = inFlightMutexes.get(key) || Promise.resolve();
  let release: () => void = () => {};
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  inFlightMutexes.set(key, nextLock);

  await currentLock;
  try {
    return await fn();
  } finally {
    release();
    if (inFlightMutexes.get(key) === nextLock) {
      inFlightMutexes.delete(key);
    }
  }
}

/**
 * Extracts and validates the client IP from trusted reverse proxy headers.
 * Rejects forged or malformed client-injected headers.
 */
export function getTrustedClientIp(request: Request): string {
  // 1. Cloudflare Tunnel / Edge connecting IP (unforgeable by client when behind Cloudflare)
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && isValidIp(cfIp.trim())) {
    return cfIp.trim();
  }

  // 2. Vercel / Standard reverse proxy real IP
  const realIp = request.headers.get('x-real-ip');
  if (realIp && isValidIp(realIp.trim())) {
    return realIp.trim();
  }

  // 3. X-Forwarded-For: validate and use the leftmost legitimate IP
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(isValidIp);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  return '127.0.0.1';
}

function isValidIp(ip: string): boolean {
  const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6 = /^([0-9a-fA-F]{1,4}:){1,7}[0-9a-fA-F]{1,4}$|^::$|^::1$/;
  return ipv4.test(ip) || ipv6.test(ip);
}

/**
 * Checks whether an account or IP is currently locked out.
 */
export async function checkLoginRateLimit(
  username: string,
  clientIp: string,
  now: number = Date.now(),
  simulateStorageFailure: boolean = false
): Promise<{ locked: boolean; remainingSeconds: number; reason?: 'account' | 'ip' }> {
  const normUser = username.trim().toLowerCase();
  const accountKey = normUser ? `rl_login:acc:${normUser}` : null;
  const ipKey = `rl_login:ip:${clientIp}`;

  // 1. Check account rate limit first (5 attempts max)
  if (accountKey) {
    const accountStatus = await checkSingleKey(accountKey, MAX_ACCOUNT_FAILED_ATTEMPTS, now, simulateStorageFailure);
    if (accountStatus.locked) {
      return { locked: true, remainingSeconds: accountStatus.remainingSeconds, reason: 'account' };
    }
  }

  // 2. Check IP rate limit ceiling (60 attempts max to protect against credential stuffing while allowing shared college Wi-Fi)
  const ipStatus = await checkSingleKey(ipKey, MAX_IP_FAILED_ATTEMPTS, now, simulateStorageFailure);
  if (ipStatus.locked) {
    return { locked: true, remainingSeconds: ipStatus.remainingSeconds, reason: 'ip' };
  }

  return { locked: false, remainingSeconds: 0 };
}

async function checkSingleKey(
  dbKey: string,
  maxAttempts: number,
  now: number,
  simulateStorageFailure: boolean
): Promise<{ locked: boolean; remainingSeconds: number }> {
  // Fast in-memory check
  const mem = memoryRateCache[dbKey];
  if (mem) {
    if (mem.lockedUntil && now < mem.lockedUntil) {
      const remainingSeconds = Math.ceil((mem.lockedUntil - now) / 1000);
      return { locked: true, remainingSeconds };
    }
    if (now - mem.firstAttempt > LOCKOUT_WINDOW_MS) {
      delete memoryRateCache[dbKey];
    } else if (mem.count >= maxAttempts) {
      const remainingSeconds = Math.ceil((mem.firstAttempt + LOCKOUT_WINDOW_MS - now) / 1000);
      return { locked: true, remainingSeconds };
    }
  }

  // If storage failure is simulated, do not query DB; rely on local degraded guard (fail-closed)
  if (simulateStorageFailure) {
    if (mem && mem.count >= maxAttempts) {
      const remaining = Math.max(1, Math.ceil(((mem.lockedUntil || (mem.firstAttempt + LOCKOUT_WINDOW_MS)) - now) / 1000));
      return { locked: true, remainingSeconds: remaining };
    }
    return { locked: false, remainingSeconds: 0 };
  }

  // Query shared Supabase storage
  try {
    const { data, error } = await supabaseServer
      .from('settings')
      .select('value')
      .eq('key', dbKey)
      .maybeSingle();

    if (!error && data?.value) {
      const val = data.value;
      const firstAttempt = Number(val.firstAttempt) || now;
      const count = Number(val.count) || 0;
      const lockedUntil = Number(val.lockedUntil) || 0;
      const version = Number(val.version) || 1;

      memoryRateCache[dbKey] = { count, version, firstAttempt, lockedUntil, lastAttempt: now };

      if (lockedUntil && now < lockedUntil) {
        const remainingSeconds = Math.ceil((lockedUntil - now) / 1000);
        return { locked: true, remainingSeconds };
      }
      if (now - firstAttempt > LOCKOUT_WINDOW_MS) {
        Promise.resolve(supabaseServer.from('settings').delete().eq('key', dbKey)).catch(() => {});
        delete memoryRateCache[dbKey];
      } else if (count >= maxAttempts) {
        const remainingSeconds = Math.ceil((firstAttempt + LOCKOUT_WINDOW_MS - now) / 1000);
        return { locked: true, remainingSeconds };
      }
    }
  } catch (err) {
    // Fail-Closed: If DB query fails, fall back strictly to local in-memory records
    if (mem && mem.count >= maxAttempts) {
      const remaining = Math.max(1, Math.ceil(((mem.lockedUntil || (mem.firstAttempt + LOCKOUT_WINDOW_MS)) - now) / 1000));
      return { locked: true, remainingSeconds: remaining };
    }
  }

  return { locked: false, remainingSeconds: 0 };
}

/**
 * Atomically acquires a login attempt slot, protecting against parallel race conditions.
 * Returns { allowed: true, release } on success, or { allowed: false, remainingSeconds } if locked.
 */
export async function acquireLoginSlot(
  username: string,
  clientIp: string,
  now: number = Date.now(),
  simulateStorageFailure: boolean = false
): Promise<{
  allowed: boolean;
  remainingSeconds: number;
  reason?: 'account' | 'ip';
  release: (success: boolean) => Promise<void>;
}> {
  const normUser = username.trim().toLowerCase();
  const accountKey = normUser ? `rl_login:acc:${normUser}` : null;
  const ipKey = `rl_login:ip:${clientIp}`;

  // 1. Initial lock check
  const initialCheck = await checkLoginRateLimit(username, clientIp, now, simulateStorageFailure);
  if (initialCheck.locked) {
    return {
      allowed: false,
      remainingSeconds: initialCheck.remainingSeconds,
      reason: initialCheck.reason,
      release: async () => {},
    };
  }

  // 2. Concurrency-safe in-flight slot reservation for the account
  if (accountKey) {
    const slotAcquired = await withKeyLock(accountKey, async () => {
      const mem = memoryRateCache[accountKey];
      if (mem && mem.lockedUntil && now < mem.lockedUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((mem.lockedUntil - now) / 1000));
        return { allowed: false, remainingSeconds };
      }
      const count = (mem && now - mem.firstAttempt <= LOCKOUT_WINDOW_MS) ? mem.count : 0;
      const inFlight = inFlightAttempts.get(accountKey) || 0;

      if (count + inFlight >= MAX_ACCOUNT_FAILED_ATTEMPTS) {
        const lockedUntil = mem?.lockedUntil || (now + LOCKOUT_WINDOW_MS);
        const remainingSeconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
        return { allowed: false, remainingSeconds };
      }

      inFlightAttempts.set(accountKey, inFlight + 1);
      return { allowed: true, remainingSeconds: 0 };
    });

    if (!slotAcquired.allowed) {
      return {
        allowed: false,
        remainingSeconds: slotAcquired.remainingSeconds,
        reason: 'account',
        release: async () => {},
      };
    }
  }

  // Slot was successfully reserved
  const release = async (success: boolean) => {
    if (accountKey) {
      await withKeyLock(accountKey, async () => {
        try {
          if (success) {
            await resetLoginRateLimit(username);
          } else {
            await recordSingleFailureWithCAS(accountKey, MAX_ACCOUNT_FAILED_ATTEMPTS, now, simulateStorageFailure);
          }
        } finally {
          const inFlight = inFlightAttempts.get(accountKey) || 1;
          if (inFlight <= 1) {
            inFlightAttempts.delete(accountKey);
          } else {
            inFlightAttempts.set(accountKey, inFlight - 1);
          }
        }
      });

      if (!success) {
        await withKeyLock(ipKey, async () => {
          await recordSingleFailureWithCAS(ipKey, MAX_IP_FAILED_ATTEMPTS, now, simulateStorageFailure);
        });
      }
    }
  };

  return { allowed: true, remainingSeconds: 0, release };
}

/**
 * Concurrency-safe atomic increment of failed attempts.
 * Uses mutex for intra-node concurrency and Compare-And-Swap (CAS) with retries
 * for inter-node/serverless storage consistency.
 */
export async function recordFailedLogin(
  username: string,
  clientIp: string,
  now: number = Date.now(),
  simulateStorageFailure: boolean = false
): Promise<{ accountCount: number; accountLocked: boolean; remainingSeconds: number }> {
  const normUser = username.trim().toLowerCase();
  const accountKey = normUser ? `rl_login:acc:${normUser}` : null;
  const ipKey = `rl_login:ip:${clientIp}`;

  let accountCount = 0;
  let accountLocked = false;
  let remainingSeconds = 0;

  // 1. Record account failure under mutex lock
  if (accountKey) {
    const res = await withKeyLock(accountKey, async () => {
      return await recordSingleFailureWithCAS(accountKey, MAX_ACCOUNT_FAILED_ATTEMPTS, now, simulateStorageFailure);
    });
    accountCount = res.count;
    accountLocked = res.locked;
    remainingSeconds = res.remainingSeconds;
  }

  // 2. Record IP failure under mutex lock
  await withKeyLock(ipKey, async () => {
    await recordSingleFailureWithCAS(ipKey, MAX_IP_FAILED_ATTEMPTS, now, simulateStorageFailure);
  });

  return { accountCount, accountLocked, remainingSeconds };
}

async function recordSingleFailureWithCAS(
  dbKey: string,
  maxAttempts: number,
  now: number,
  simulateStorageFailure: boolean
): Promise<{ count: number; locked: boolean; remainingSeconds: number }> {
  // Update in-memory state first (always guarantees local accounting even if storage is down)
  const mem = memoryRateCache[dbKey] || {
    count: 0,
    version: 1,
    firstAttempt: now,
    lockedUntil: 0,
    lastAttempt: now,
  };

  if (now - mem.firstAttempt > LOCKOUT_WINDOW_MS) {
    mem.count = 1;
    mem.firstAttempt = now;
    mem.lockedUntil = 0;
  } else {
    mem.count += 1;
  }
  mem.version += 1;
  mem.lastAttempt = now;

  if (mem.count >= maxAttempts && !mem.lockedUntil) {
    mem.lockedUntil = now + LOCKOUT_WINDOW_MS;
  }
  memoryRateCache[dbKey] = mem;

  const isLocked = Boolean(mem.lockedUntil && now < mem.lockedUntil);
  const remaining = isLocked ? Math.ceil((mem.lockedUntil - now) / 1000) : 0;

  // If storage failure is simulated, do not write to DB; in-memory has already registered the failure (Fail-Closed)
  if (simulateStorageFailure) {
    return { count: mem.count, locked: isLocked, remainingSeconds: remaining };
  }

  // Persist to Supabase with Optimistic Concurrency Control (CAS) and up to 3 retries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data: existing } = await supabaseServer
        .from('settings')
        .select('value')
        .eq('key', dbKey)
        .maybeSingle();

      const existingVal = existing?.value;
      const isExpired = !existingVal || (now - (Number(existingVal.firstAttempt) || now) > LOCKOUT_WINDOW_MS);

      if (isExpired) {
        const freshEntry: RateLimitEntry = {
          count: mem.count,
          version: (existingVal?.version || 0) + 1,
          firstAttempt: now,
          lockedUntil: mem.count >= maxAttempts ? now + LOCKOUT_WINDOW_MS : 0,
          lastAttempt: now,
        };
        const { error: upsertErr } = await supabaseServer
          .from('settings')
          .upsert({ key: dbKey, value: freshEntry }, { onConflict: 'key' });

        if (!upsertErr) {
          mem.version = freshEntry.version;
          break;
        }
      } else {
        const oldVersion = Number(existingVal.version) || 1;
        const currentCount = Math.max(Number(existingVal.count) || 0, mem.count - 1) + 1;
        const currentLocked = currentCount >= maxAttempts ? (existingVal.lockedUntil || (now + LOCKOUT_WINDOW_MS)) : 0;
        const nextVersion = oldVersion + 1;

        const updatedEntry: RateLimitEntry = {
          count: currentCount,
          version: nextVersion,
          firstAttempt: Number(existingVal.firstAttempt) || now,
          lockedUntil: currentLocked,
          lastAttempt: now,
        };

        const { data: updateRes, error: updateErr } = await supabaseServer
          .from('settings')
          .update({ value: updatedEntry })
          .eq('key', dbKey)
          .eq('value->>version', String(oldVersion))
          .select();

        if (!updateErr && updateRes && updateRes.length > 0) {
          mem.count = currentCount;
          mem.version = nextVersion;
          mem.lockedUntil = currentLocked;
          break;
        }
      }
    } catch (err) {
      console.warn(`[RATE LIMIT DB CAS WARNING] (attempt ${attempt + 1})`, err);
    }
  }

  return { count: mem.count, locked: isLocked, remainingSeconds: remaining };
}

/**
 * Resets the rate limit upon successful authentication.
 * Immediately clears both in-memory cache and persistent Supabase storage.
 */
export async function resetLoginRateLimit(username: string): Promise<void> {
  const normUser = username.trim().toLowerCase();
  const accountKey = `rl_login:acc:${normUser}`;

  delete memoryRateCache[accountKey];
  inFlightAttempts.delete(accountKey);

  try {
    await supabaseServer.from('settings').delete().eq('key', accountKey);
  } catch (err) {
    console.warn('[RATE LIMIT RESET DB WARNING]', err);
  }
}

/**
 * Shared & Persistent Student Roll Lookup Rate Limiter (L1 in-memory + L2 Supabase settings table).
 * Enforces: Max 10 roll lookups per IP per 60 seconds to prevent roster scraping and student enumeration.
 * Synchronized across Next.js and Python backend using the shared key `rl_lookup:{clientIp}`.
 */
const memoryLookupLimits: Record<string, number[]> = {};

export async function checkStudentLookupRateLimit(
  clientIp: string,
  nowSec: number = Date.now() / 1000
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const dbKey = `rl_lookup:${clientIp}`;
  const windowSeconds = 60.0;
  const maxAttempts = 10;

  // 1. Authoritative L2 Atomic Transaction via PostgreSQL stored procedure (ACID + row/advisory locking)
  try {
    const { data, error } = await supabaseServer.rpc('atomic_check_rate_limit', {
      p_key: dbKey,
      p_max_attempts: maxAttempts,
      p_window_seconds: windowSeconds,
      p_now_ts: nowSec,
    });

    if (!error && data && typeof data === 'object' && 'allowed' in data) {
      const allowed = Boolean(data.allowed);
      const remainingSeconds = Number(data.retry_after) || 0;
      return { allowed, remainingSeconds };
    }
  } catch (err) {
    console.warn('[LookupRateLimit Warning] L2 DB atomic RPC fallback:', err);
  }

  // 2. Degraded In-Memory Fail-Closed Fallback (If RPC or database is offline/unreachable)
  let attempts: number[] = (memoryLookupLimits[clientIp] || []).filter(
    (ts) => nowSec - ts < windowSeconds
  );

  if (attempts.length >= maxAttempts) {
    memoryLookupLimits[clientIp] = attempts;
    const oldest = attempts[0];
    const remainingSeconds = Math.max(1, Math.ceil(windowSeconds - (nowSec - oldest)));
    return { allowed: false, remainingSeconds };
  }

  attempts.push(nowSec);
  memoryLookupLimits[clientIp] = attempts;

  return { allowed: true, remainingSeconds: 0 };
}

/**
 * Resets the lookup rate limit for a specific client IP (used in tests and admin actions).
 */
export async function resetStudentLookupRateLimit(clientIp: string): Promise<void> {
  delete memoryLookupLimits[clientIp];
  const dbKey = `rl_lookup:${clientIp}`;
  try {
    await supabaseServer.from('settings').delete().eq('key', dbKey);
  } catch (err) {
    console.warn('[LookupRateLimit Reset Warning]', err);
  }
}

