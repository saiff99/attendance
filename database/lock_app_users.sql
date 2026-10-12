-- ==============================================================================
-- 🔒 MedAttend AI: Complete Lockdown of app_users Table
-- This script dynamically drops ANY and ALL existing policies on app_users,
-- and enforces strict Zero-Trust access restricted to service_role ONLY.
-- Run this in Supabase Dashboard > SQL Editor.
-- ==============================================================================

-- 1. Enable Row Level Security on app_users
ALTER TABLE IF EXISTS public.app_users ENABLE ROW LEVEL SECURITY;

-- 2. Dynamically drop all existing policies on app_users (regardless of their names)
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'app_users' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.app_users';
    END LOOP;
END $$;

-- 3. Create strict service_role only policy (No anon, no public, no external access)
CREATE POLICY "service_role_unrestricted_app_users"
ON public.app_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Verify confirmation
COMMENT ON TABLE public.app_users IS 'MedAttend Admin Accounts (Zero-Trust Service-Role Isolation)';
