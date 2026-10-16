-- ==============================================================================
-- 🛡️ Supabase Migration 09: Complete Zero-Trust RLS Purge & Hardened Lockdown
-- 1. Dynamically purges ALL legacy, permissive, and ad-hoc policies from all tables.
-- 2. Restricts students, sessions, attendance, audit_logs, app_users, and settings
--    strictly to server-side service_role (Zero-Trust).
-- 3. Grants minimal, read-only SELECT access on academic_subjects for active items.
-- 4. Runs an automated validation check asserting 0 permissive policies remain.
-- ==============================================================================

-- 1. Enable and Force Row Level Security (RLS) on all core tables
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attendance FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_users FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.academic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.academic_subjects FORCE ROW LEVEL SECURITY;


-- 2. DYNAMIC PURGE: Drop ALL existing policies on all protected tables
-- This ensures no legacy policies (e.g. anon_manage_students, allow_read_students, etc.) survive.
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('students', 'sessions', 'attendance', 'audit_logs', 'app_users', 'settings', 'academic_subjects')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;


-- ==============================================================================
-- 🔒 3. ZERO-TRUST POLICIES: SERVICE_ROLE ONLY FOR SENSITIVE DATA
-- ==============================================================================

-- 3.1 students table: Only server-side service_role has access
CREATE POLICY "service_role_full_students"
ON public.students
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.2 sessions table: Only server-side service_role has access
CREATE POLICY "service_role_full_sessions"
ON public.sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.3 attendance table: Only server-side service_role has access
CREATE POLICY "service_role_full_attendance"
ON public.attendance
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.4 audit_logs table: Only server-side service_role has access (Immutable ledger)
CREATE POLICY "service_role_full_audit_logs"
ON public.audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.5 app_users table: Only server-side service_role has access (Credentials store)
CREATE POLICY "service_role_full_app_users"
ON public.app_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.6 settings table: Only server-side service_role has access (System config & tunnel)
CREATE POLICY "service_role_full_settings"
ON public.settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 📚 4. LIMITED PUBLIC ACCESS: ACADEMIC SUBJECTS (READ-ONLY)
-- ==============================================================================

-- 4.1 service_role: Full access for curriculum management
CREATE POLICY "service_role_full_academic_subjects"
ON public.academic_subjects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4.2 anon & authenticated: Strictly read-only for active curriculum subjects
CREATE POLICY "academic_subjects_public_read_active"
ON public.academic_subjects
FOR SELECT
TO anon, authenticated
USING (is_active = true);


-- ==============================================================================
-- 🔍 5. AUTOMATED INTEGRITY ASSERTION & VERIFICATION
-- ==============================================================================
DO $$
DECLARE
    leaks INTEGER;
BEGIN
    -- Assert that no policy allows anon, authenticated, or public access on sensitive tables
    SELECT COUNT(*) INTO leaks
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('students', 'sessions', 'attendance', 'audit_logs', 'app_users', 'settings')
      AND (
          'anon' = ANY(roles) 
          OR 'authenticated' = ANY(roles) 
          OR 'public' = ANY(roles)
      );

    IF leaks > 0 THEN
        RAISE EXCEPTION '❌ RLS Lockdown Verification Failed! Found % permissive policies on sensitive tables.', leaks;
    ELSE
        RAISE NOTICE '✅ RLS Lockdown Verification SUCCESS: All sensitive tables are 100%% protected (service_role only).';
    END IF;
END $$;

-- Query to view active policies:
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles, 
    cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
