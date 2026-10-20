-- ==============================================================================
-- 👥 Supabase Migration 12: Add 'Admin' Role to app_users Table
-- Run this in Supabase Dashboard > SQL Editor
-- ==============================================================================

-- 1. Drop existing role check constraint if present
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

-- 2. Add updated role check constraint allowing 'Super Admin', 'Admin', and 'Faculty'
ALTER TABLE public.app_users 
ADD CONSTRAINT app_users_role_check 
CHECK (role IN ('Super Admin', 'Admin', 'Faculty'));

COMMENT ON CONSTRAINT app_users_role_check ON public.app_users IS 'Allows Super Admin, Admin, and Faculty roles';
