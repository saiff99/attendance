import { createClient } from '@supabase/supabase-js';

// Retrieve environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if variables are defined to prevent client initialization errors
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase URL or Anon Key is missing. Make sure to set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.");
}

// Create and export the Supabase client
export const supabase = createClient(
  supabaseUrl || "https://placeholder-url.supabase.co", 
  supabaseAnonKey || "placeholder-key"
);
