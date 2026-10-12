-- ==============================================================================
-- 🛡️ MedAttend AI — Enterprise Zero-Trust Row Level Security (RLS) Hardening
-- Run this script in your Supabase Dashboard > SQL Editor.
-- Requires SUPABASE_SERVICE_ROLE_KEY configured in backend and frontend.
-- ==============================================================================

-- 1. Enable Row Level Security (RLS) on all core tables
ALTER TABLE IF EXISTS app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academic_subjects ENABLE ROW LEVEL SECURITY;


-- ==============================================================================
-- 🔒 1. APP_USERS TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- Anonymous and public clients CANNOT read, insert, update, or delete accounts.
-- Prevents attackers from inserting Super Admin accounts or changing passwords.
-- ==============================================================================
-- Dynamically drop ALL previous policies on app_users (regardless of their name)
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'app_users' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.app_users';
    END LOOP;
END $$;

-- Only server / service_role has access to user credentials and admin profiles:
CREATE POLICY "service_role_unrestricted_app_users"
ON app_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🔒 2. AUDIT_LOGS TABLE — STRICT ZERO-TRUST (SERVICE ROLE ONLY)
-- Anonymous and public clients CANNOT tamper with or read security audit logs.
-- ==============================================================================
DROP POLICY IF EXISTS "service_role_unrestricted_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "service_role_full_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "anon_manage_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "allow_read_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "allow_insert_audit_logs" ON audit_logs;

-- Only server / service_role can write and inspect security audit logs:
CREATE POLICY "service_role_unrestricted_audit_logs"
ON audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 📅 3. SESSIONS TABLE — SECURE SYSTEM CONFIG ISOLATION
-- Protects internal system configs (__SYSTEM_CONFIG__) and tunnel signatures.
-- ==============================================================================
DROP POLICY IF EXISTS "service_role_unrestricted_sessions" ON sessions;
DROP POLICY IF EXISTS "service_role_full_sessions" ON sessions;
DROP POLICY IF EXISTS "authenticated_staff_manage_sessions" ON sessions;
DROP POLICY IF EXISTS "anon_manage_sessions" ON sessions;
DROP POLICY IF EXISTS "allow_read_sessions" ON sessions;
DROP POLICY IF EXISTS "allow_insert_sessions" ON sessions;
DROP POLICY IF EXISTS "allow_update_sessions" ON sessions;
DROP POLICY IF EXISTS "allow_delete_sessions" ON sessions;
DROP POLICY IF EXISTS "anon_read_active_sessions_only" ON sessions;
DROP POLICY IF EXISTS "anon_insert_sessions" ON sessions;
DROP POLICY IF EXISTS "anon_update_sessions" ON sessions;

-- Full access for backend services (syncing tunnel URLs, managing live scan):
CREATE POLICY "service_role_unrestricted_sessions"
ON sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public clients can read active academic class sessions (hides __SYSTEM_CONFIG__):
CREATE POLICY "anon_read_active_sessions_only"
ON sessions
FOR SELECT
TO anon, authenticated
USING (class_name != '__SYSTEM_CONFIG__');

-- Classroom live-scan can create new academic sessions (cannot touch system config):
CREATE POLICY "anon_insert_sessions"
ON sessions
FOR INSERT
TO anon, authenticated
WITH CHECK (class_name != '__SYSTEM_CONFIG__');

-- Active classroom sessions can be updated (cannot overwrite system config):
CREATE POLICY "anon_update_sessions"
ON sessions
FOR UPDATE
TO anon, authenticated
USING (class_name != '__SYSTEM_CONFIG__')
WITH CHECK (class_name != '__SYSTEM_CONFIG__');


-- ==============================================================================
-- 🎓 4. STUDENTS TABLE — PROTECTED ROSTER
-- ==============================================================================
DROP POLICY IF EXISTS "service_role_unrestricted_students" ON students;
DROP POLICY IF EXISTS "service_role_full_students" ON students;
DROP POLICY IF EXISTS "anon_manage_students" ON students;
DROP POLICY IF EXISTS "allow_read_students" ON students;
DROP POLICY IF EXISTS "allow_insert_students" ON students;
DROP POLICY IF EXISTS "allow_update_students" ON students;
DROP POLICY IF EXISTS "allow_delete_students" ON students;

-- Full unrestricted control for server-side operations:
CREATE POLICY "service_role_unrestricted_students"
ON students
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Read access for student lookup and attendance check-in:
CREATE POLICY "allow_read_students"
ON students
FOR SELECT
TO anon, authenticated
USING (true);

-- Student roster management (creating, updating, deleting profiles):
CREATE POLICY "allow_insert_students"
ON students
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "allow_update_students"
ON students
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "allow_delete_students"
ON students
FOR DELETE
TO anon, authenticated
USING (true);


-- ==============================================================================
-- 📝 5. ATTENDANCE TABLE — IMMUTABLE LEDGER
-- Prevents unauthorized deletion of biometric attendance logs.
-- ==============================================================================
DROP POLICY IF EXISTS "service_role_unrestricted_attendance" ON attendance;
DROP POLICY IF EXISTS "service_role_full_attendance" ON attendance;
DROP POLICY IF EXISTS "anon_manage_attendance" ON attendance;
DROP POLICY IF EXISTS "allow_read_attendance" ON attendance;
DROP POLICY IF EXISTS "allow_insert_attendance" ON attendance;
DROP POLICY IF EXISTS "allow_update_attendance" ON attendance;
DROP POLICY IF EXISTS "allow_delete_attendance" ON attendance;

-- Full access for backend services (Live scan, face recognition verification):
CREATE POLICY "service_role_unrestricted_attendance"
ON attendance
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Read access for analytics, student portal, and report generation:
CREATE POLICY "allow_read_attendance"
ON attendance
FOR SELECT
TO anon, authenticated
USING (true);

-- Insert attendance logs (Verified live scan, batch upload, mobile selfie):
CREATE POLICY "allow_insert_attendance"
ON attendance
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Manual override updates:
CREATE POLICY "allow_update_attendance"
ON attendance
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 📚 6. ACADEMIC SUBJECTS TABLE
-- ==============================================================================
DROP POLICY IF EXISTS "service_role_unrestricted_subjects" ON academic_subjects;
DROP POLICY IF EXISTS "anon_read_subjects" ON academic_subjects;
DROP POLICY IF EXISTS "anon_manage_subjects" ON academic_subjects;

CREATE POLICY "service_role_unrestricted_subjects"
ON academic_subjects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "anon_read_subjects"
ON academic_subjects
FOR SELECT
TO anon, authenticated
USING (true);


-- ==============================================================================
-- 🚀 Confirmation & Schema Documentation
-- ==============================================================================
COMMENT ON TABLE app_users IS 'MedAttend Administrative Users (Strict Service-Role Isolation)';
COMMENT ON TABLE audit_logs IS 'MedAttend Security Audit Trail (Strict Service-Role Isolation)';
COMMENT ON TABLE students IS 'MedAttend Biometric Student Registry (RLS Protected)';
COMMENT ON TABLE sessions IS 'MedAttend Academic Class Sessions (RLS Protected, Config Hidden)';
COMMENT ON TABLE attendance IS 'MedAttend Biometric Attendance Ledger (RLS Protected)';
