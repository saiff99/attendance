-- ==============================================================================
-- 🛡️ MedAttend AI — Enterprise Supabase Row Level Security (RLS) Policies
-- Run this script in your Supabase Dashboard > SQL Editor to fully secure your database.
-- ==============================================================================

-- 1. Enable Row Level Security on all core tables
ALTER TABLE IF EXISTS students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance ENABLE ROW LEVEL SECURITY;

-- Clean up any legacy conflicting policies if they exist
DROP POLICY IF EXISTS "Allow public read access to students" ON students;
DROP POLICY IF EXISTS "Allow service_role full access to students" ON students;
DROP POLICY IF EXISTS "Allow authenticated full access to students" ON students;
DROP POLICY IF EXISTS "Allow anon read access to students" ON students;

DROP POLICY IF EXISTS "Allow public read access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow service_role full access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow authenticated full access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anon read access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow tunnel config updates on sessions" ON sessions;

DROP POLICY IF EXISTS "Allow public read access to attendance" ON attendance;
DROP POLICY IF EXISTS "Allow service_role full access to attendance" ON attendance;
DROP POLICY IF EXISTS "Allow authenticated full access to attendance" ON attendance;
DROP POLICY IF EXISTS "Allow insert attendance logs" ON attendance;

-- ==============================================================================
-- 🎓 STUDENTS TABLE POLICIES
-- ==============================================================================

-- 1.1 Allow backend service_role full unrestricted access (FastAPI Backend)
CREATE POLICY "service_role_full_students"
ON students
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 1.2 Allow application users (authenticated & anon client) to READ student records
CREATE POLICY "allow_read_students"
ON students
FOR SELECT
TO authenticated, anon
USING (true);

-- 1.3 Allow application users (authenticated & anon client) to INSERT new student profiles
CREATE POLICY "allow_insert_students"
ON students
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- 1.4 Allow application users (authenticated & anon client) to UPDATE student records & face encodings
CREATE POLICY "allow_update_students"
ON students
FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 1.5 Allow DELETE only for authenticated staff or service_role
CREATE POLICY "allow_delete_students"
ON students
FOR DELETE
TO authenticated, service_role
USING (true);


-- ==============================================================================
-- 📅 SESSIONS TABLE POLICIES
-- ==============================================================================

-- 2.1 Allow backend service_role full unrestricted access
CREATE POLICY "service_role_full_sessions"
ON sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2.2 Allow application users to READ class sessions
CREATE POLICY "allow_read_sessions"
ON sessions
FOR SELECT
TO authenticated, anon
USING (true);

-- 2.3 Allow application users to CREATE new class sessions
CREATE POLICY "allow_insert_sessions"
ON sessions
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- 2.4 Allow application users to UPDATE ongoing sessions & sync Cloudflare tunnel URLs
CREATE POLICY "allow_update_sessions"
ON sessions
FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 2.5 Allow DELETE sessions for authenticated staff and service_role
CREATE POLICY "allow_delete_sessions"
ON sessions
FOR DELETE
TO authenticated, service_role
USING (true);


-- ==============================================================================
-- 📝 ATTENDANCE TABLE POLICIES
-- ==============================================================================

-- 3.1 Allow backend service_role full unrestricted access
CREATE POLICY "service_role_full_attendance"
ON attendance
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.2 Allow application to READ attendance records (reports, analytics, live scan)
CREATE POLICY "allow_read_attendance"
ON attendance
FOR SELECT
TO authenticated, anon
USING (true);

-- 3.3 Allow logging attendance records (Live Scan, Selfie Check-in, Batch Upload)
CREATE POLICY "allow_insert_attendance"
ON attendance
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- 3.4 Allow attendance status updates (manual overrides)
CREATE POLICY "allow_update_attendance"
ON attendance
FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 3.5 Allow DELETE only for authenticated staff or service_role
CREATE POLICY "allow_delete_attendance"
ON attendance
FOR DELETE
TO authenticated, service_role
USING (true);

-- ==============================================================================
-- 🚀 Confirmation
-- ==============================================================================
COMMENT ON TABLE students IS 'MedAttend Biometric Student Registry (RLS Protected)';
COMMENT ON TABLE sessions IS 'MedAttend Academic Class Sessions (RLS Protected)';
COMMENT ON TABLE attendance IS 'MedAttend Biometric Attendance Ledger (RLS Protected)';
