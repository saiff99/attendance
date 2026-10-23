import { createClient } from '@supabase/supabase-js';

// Retrieve environment variables strictly without hardcoded fallback credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  if (typeof window !== 'undefined') {
    console.error('[CRITICAL CONFIG ERROR] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured.');
  }
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
