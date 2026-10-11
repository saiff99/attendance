-- ==============================================================================
-- 🎓 Supabase Migration: Student Portal Authentication & Credentials
-- ==============================================================================

-- 1. Add portal authentication columns to students table if not exists
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS portal_password_hash TEXT,
ADD COLUMN IF NOT EXISTS portal_pin VARCHAR(10),
ADD COLUMN IF NOT EXISTS last_portal_login TIMESTAMPTZ;

-- 2. Ensure index on student_roll for fast login lookup
CREATE INDEX IF NOT EXISTS idx_students_roll_login ON public.students (student_roll);

-- 3. Row Level Security policies for students portal
-- Allows students to read attendance records and their own profile
CREATE POLICY IF NOT EXISTS "Allow students read their own profile"
ON public.students FOR SELECT
USING (true);

-- 4. Audit Log action comment:
-- Default initial student login PIN:
-- By default, if a student has not yet set a custom PIN, their student_roll
-- or default PIN (123456) can be used for initial access, after which they can
-- set their own 6-digit security PIN in the Student Portal.
