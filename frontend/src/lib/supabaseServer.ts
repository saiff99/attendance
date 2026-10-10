import { createClient } from '@supabase/supabase-js';

// Server-only Supabase Client with Service Role Key (Bypasses RLS on the server)
// WARNING: This file must only be imported in server-side code (API routes, Server Components, server actions)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bsphlgmxzmlbgzanpujh.supabase.co";
const supabaseServiceRoleKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  "sb_publishable_u8O4lCQg9KtcxeLj7nxqFg_xu3v2WLz";

export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
