import { supabaseServer } from '@/lib/supabaseServer';

// Shared In-Memory User Map Cache (5-minute TTL)
// Avoids querying Supabase app_users table repeatedly across active-sessions, sessions, and logs
let cachedUserMap: Record<string, string> | null = null;
let userMapCachedAt = 0;
export const USER_MAP_TTL_MS = 5 * 60 * 1000;

export async function getCachedUserMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedUserMap && now - userMapCachedAt < USER_MAP_TTL_MS) {
    return cachedUserMap;
  }
  const userMap: Record<string, string> = {
    admin: 'System Administrator',
    faculty: 'Faculty Member',
  };
  try {
    const { data: appUsers } = await supabaseServer
      .from('app_users')
      .select('username, full_name');
    if (appUsers) {
      appUsers.forEach((u: any) => {
        if (u.username && u.full_name) {
          userMap[u.username.toLowerCase()] = u.full_name;
        }
      });
    }
    cachedUserMap = userMap;
    userMapCachedAt = now;
  } catch (e) {
    if (cachedUserMap) return cachedUserMap;
  }
  return userMap;
}

export function invalidateUserMapCache() {
  cachedUserMap = null;
  userMapCachedAt = 0;
}

