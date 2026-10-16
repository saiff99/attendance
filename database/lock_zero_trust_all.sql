-- ==============================================================================
-- 🛡️ MedAttend AI — Comprehensive Enterprise Zero-Trust Lockdown
-- Run this script in your Supabase Dashboard > SQL Editor.
-- Drops all public/anon policies on all tables so anon key can never read/write/delete.
-- Only server-side service_role (backend & Next.js API routes) has access.
-- ==============================================================================

-- 1. Ensure Row Level Security (RLS) is ENABLED on all core tables
ALTER TABLE IF EXISTS app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academic_subjects ENABLE ROW LEVEL SECURITY;


-- ==============================================================================
-- 🔒 1. APP_USERS TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- ==============================================================================
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'app_users' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.app_users';
    END LOOP;
END $$;

CREATE POLICY "service_role_unrestricted_app_users"
ON public.app_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🔒 2. AUDIT_LOGS TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- ==============================================================================
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.audit_logs';
    END LOOP;
END $$;

CREATE POLICY "service_role_unrestricted_audit_logs"
ON public.audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🔒 3. STUDENTS TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- Anonymous and public clients CANNOT read passwords, face vectors, or delete students.
-- ==============================================================================
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'students' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.students';
    END LOOP;
END $$;

CREATE POLICY "service_role_unrestricted_students"
ON public.students
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🔒 4. SESSIONS TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- Anonymous and public clients CANNOT create fake sessions or tamper with timers.
-- ==============================================================================
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'sessions' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.sessions';
    END LOOP;
END $$;

CREATE POLICY "service_role_unrestricted_sessions"
ON public.sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🔒 5. ATTENDANCE TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- Anonymous and public clients CANNOT fake biometric logs or modify records.
-- ==============================================================================
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'attendance' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.attendance';
    END LOOP;
END $$;

CREATE POLICY "service_role_unrestricted_attendance"
ON public.attendance
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🔒 6. ACADEMIC_SUBJECTS TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- ==============================================================================
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'academic_subjects' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.academic_subjects';
    END LOOP;
END $$;

CREATE POLICY "service_role_unrestricted_academic_subjects"
ON public.academic_subjects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🔒 7. SETTINGS TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- Creates settings table if missing and locks it down to service_role only.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'settings' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.settings';
    END LOOP;
END $$;

CREATE POLICY "service_role_unrestricted_settings"
ON public.settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🚀 Verification Query
-- ==============================================================================
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
