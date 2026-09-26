import { createClient } from '@supabase/supabase-js';

// Retrieve environment variables with fallback credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bsphlgmxzmlbgzanpujh.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_u8O4lCQg9KtcxeLj7nxqFg_xu3v2WLz";

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
