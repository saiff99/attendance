import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Server-only Supabase Client with Service Role Key (Bypasses RLS on the server)
// WARNING: This file must only be imported in server-side code (API routes, Server Components, server actions)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bsphlgmxzmlbgzanpujh.supabase.co";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Fail-Fast: Enforce service-role credentials on the server.
// Silent fallback to public anon keys or hardcoded publishable keys is strictly prohibited.
if (!supabaseServiceRoleKey) {
  const errorMsg = 
    '[CRITICAL SECURITY ERROR] SUPABASE_SERVICE_ROLE_KEY is required for server-side database operations! ' +
    'Under Zero-Trust RLS, public anon keys cannot access protected tables. ' +
    'Please set SUPABASE_SERVICE_ROLE_KEY in your environment.';

  if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
    throw new Error(errorMsg);
  } else {
    console.error(errorMsg);
  }
}

export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
