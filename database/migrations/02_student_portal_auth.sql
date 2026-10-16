-- ==============================================================================
-- 🎓 Supabase Migration 02: Student Portal Authentication & Credentials
-- Adds portal authentication columns to students table
-- ==============================================================================

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS portal_password_hash TEXT,
ADD COLUMN IF NOT EXISTS portal_pin VARCHAR(20),
ADD COLUMN IF NOT EXISTS last_portal_login TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS biometric_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS biometric_consent_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS manual_marked_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_students_roll_login ON public.students (student_roll);
