// Shared In-Memory Session Info Cache (60s TTL)
// Avoids querying Supabase sessions table repeatedly during live-scan and attendance polling
export const sessionInfoCache = new Map<string, { info: any; expiresAt: number }>();
export const SESSION_INFO_TTL_MS = 60 * 1000;

export function getCachedSessionInfo(sessionId: string): any | null {
  const cached = sessionInfoCache.get(sessionId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.info;
  }
  if (cached) {
    sessionInfoCache.delete(sessionId);
  }
  return null;
}

export function setCachedSessionInfo(sessionId: string, info: any): void {
  sessionInfoCache.set(sessionId, {
    info,
    expiresAt: Date.now() + SESSION_INFO_TTL_MS,
  });
}

export function invalidateSessionInfoCache(sessionId?: string): void {
  if (sessionId) {
    sessionInfoCache.delete(sessionId);
  } else {
    sessionInfoCache.clear();
  }
}
