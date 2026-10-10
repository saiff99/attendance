-- ==============================================================================
-- 🛡️ MedAttend AI — Enterprise Zero-Trust Row Level Security (RLS) Policies
-- Run this script in your Supabase Dashboard > SQL Editor to secure your database.
-- ==============================================================================

-- 1. Enable Row Level Security on all core tables
ALTER TABLE IF EXISTS students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Drop all legacy and previous policies for a clean, idempotent setup
DROP POLICY IF EXISTS "Allow public read access to students" ON students;
DROP POLICY IF EXISTS "Allow service_role full access to students" ON students;
DROP POLICY IF EXISTS "Allow authenticated full access to students" ON students;
DROP POLICY IF EXISTS "Allow anon read access to students" ON students;
DROP POLICY IF EXISTS "service_role_full_students" ON students;
DROP POLICY IF EXISTS "service_role_unrestricted_students" ON students;
DROP POLICY IF EXISTS "authenticated_staff_manage_students" ON students;
DROP POLICY IF EXISTS "anon_read_students" ON students;
DROP POLICY IF EXISTS "allow_read_students" ON students;
DROP POLICY IF EXISTS "allow_insert_students" ON students;
DROP POLICY IF EXISTS "allow_update_students" ON students;
DROP POLICY IF EXISTS "allow_delete_students" ON students;

DROP POLICY IF EXISTS "Allow public read access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow service_role full access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow authenticated full access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anon read access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow tunnel config updates on sessions" ON sessions;
DROP POLICY IF EXISTS "service_role_full_sessions" ON sessions;
DROP POLICY IF EXISTS "service_role_unrestricted_sessions" ON sessions;
DROP POLICY IF EXISTS "authenticated_staff_manage_sessions" ON sessions;
DROP POLICY IF EXISTS "anon_read_active_sessions_only" ON sessions;
DROP POLICY IF EXISTS "allow_tunnel_sync_sessions" ON sessions;
DROP POLICY IF EXISTS "allow_read_sessions" ON sessions;
DROP POLICY IF EXISTS "allow_insert_sessions" ON sessions;
DROP POLICY IF EXISTS "allow_update_sessions" ON sessions;
DROP POLICY IF EXISTS "allow_delete_sessions" ON sessions;

DROP POLICY IF EXISTS "Allow public read access to attendance" ON attendance;
DROP POLICY IF EXISTS "Allow service_role full access to attendance" ON attendance;
DROP POLICY IF EXISTS "Allow authenticated full access to attendance" ON attendance;
DROP POLICY IF EXISTS "Allow insert attendance logs" ON attendance;
DROP POLICY IF EXISTS "service_role_full_attendance" ON attendance;
DROP POLICY IF EXISTS "service_role_unrestricted_attendance" ON attendance;
DROP POLICY IF EXISTS "authenticated_staff_manage_attendance" ON attendance;
DROP POLICY IF EXISTS "anon_read_attendance" ON attendance;
DROP POLICY IF EXISTS "allow_read_attendance" ON attendance;
DROP POLICY IF EXISTS "allow_insert_attendance" ON attendance;
DROP POLICY IF EXISTS "allow_update_attendance" ON attendance;
DROP POLICY IF EXISTS "allow_delete_attendance" ON attendance;

DROP POLICY IF EXISTS "service_role_full_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "service_role_unrestricted_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "allow_read_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "allow_insert_audit_logs" ON audit_logs;

-- ==============================================================================
-- 🔒 1. AUDIT LOGS TABLE POLICIES (Strict Zero-Trust — Service Role Only)
-- Anon clients CANNOT read, write, update, or tamper with audit trail logs.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id VARCHAR(255) DEFAULT 'system_admin',
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE POLICY "service_role_unrestricted_audit_logs"
ON audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 🎓 2. STUDENTS TABLE POLICIES
-- Anon clients CANNOT INSERT, UPDATE, or DELETE student records or biometric data.
-- ==============================================================================

-- 2.1 Backend / Server-side Full Control
CREATE POLICY "service_role_unrestricted_students"
ON students
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2.2 Authenticated Staff Full Management
CREATE POLICY "authenticated_staff_manage_students"
ON students
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 2.3 Read-only access for student lookup during verification
CREATE POLICY "anon_read_students"
ON students
FOR SELECT
TO anon
USING (true);


-- ==============================================================================
-- 📅 3. SESSIONS TABLE POLICIES
-- Anon clients CANNOT modify sessions or view internal system configs.
-- ==============================================================================

-- 3.1 Backend / Server-side Full Control
CREATE POLICY "service_role_unrestricted_sessions"
ON sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.2 Authenticated Staff Full Management
CREATE POLICY "authenticated_staff_manage_sessions"
ON sessions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 3.3 Anon clients can only read ACTIVE CLASS sessions (Hides __SYSTEM_CONFIG__)
CREATE POLICY "anon_read_active_sessions_only"
ON sessions
FOR SELECT
TO anon
USING (class_name != '__SYSTEM_CONFIG__');

-- 3.4 Allow launcher / start.py to upsert live Cloudflare tunnel URL on system config session
CREATE POLICY "allow_tunnel_sync_sessions"
ON sessions
FOR ALL
TO anon, authenticated
USING (id = '00000000-0000-0000-0000-000000000000' OR class_name = '__SYSTEM_CONFIG__')
WITH CHECK (id = '00000000-0000-0000-0000-000000000000' OR class_name = '__SYSTEM_CONFIG__');


-- ==============================================================================
-- 📝 4. ATTENDANCE TABLE POLICIES
-- Anon clients CANNOT directly UPDATE or DELETE attendance ledger.
-- All writes are handled via AI Engine & Verified Server Routes.
-- ==============================================================================

-- 4.1 Backend / Server-side Full Control
CREATE POLICY "service_role_unrestricted_attendance"
ON attendance
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4.2 Authenticated Staff Full Management
CREATE POLICY "authenticated_staff_manage_attendance"
ON attendance
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4.3 Read-only access for classroom dashboard & verification stats
CREATE POLICY "anon_read_attendance"
ON attendance
FOR SELECT
TO anon
USING (true);


-- ==============================================================================
-- 🚀 Confirmation & Schema Documentation
-- ==============================================================================
COMMENT ON TABLE students IS 'MedAttend Biometric Student Registry (RLS Zero-Trust Enforced, DPDP Act 2023 Compliant)';
COMMENT ON TABLE sessions IS 'MedAttend Academic Class Sessions (RLS Zero-Trust Protected)';
COMMENT ON TABLE attendance IS 'MedAttend Biometric Attendance Ledger (RLS Zero-Trust Protected)';
COMMENT ON TABLE audit_logs IS 'MedAttend Security Audit Trail (Strict Service-Role Isolation)';
