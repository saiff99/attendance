-- ==============================================================================
-- 📜 Supabase Migration 14: Soft-Delete Archival & Attendance History Retention
-- Regulatory Compliance: National Medical Commission (NMC) & University Audit Integrity
-- ==============================================================================
-- 1. Adds soft-delete and archival columns to students and sessions tables.
-- 2. Prevents catastrophic cascading attendance deletion when records are archived.
-- 3. Ensures historical student attendance logs remain 100% preserved for legal/academic audits.
-- ==============================================================================

-- 1. Add archival and soft-delete columns to sessions
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 2. Add soft-delete and archival columns to students
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 3. Indexes for performant filtering of active records
CREATE INDEX IF NOT EXISTS idx_sessions_is_archived ON public.sessions (is_archived);
CREATE INDEX IF NOT EXISTS idx_students_is_active ON public.students (is_active);

COMMENT ON COLUMN public.sessions.is_archived IS 'Flag indicating the session has been archived. Preserves all linked attendance records.';
COMMENT ON COLUMN public.students.is_active IS 'Flag indicating active student status. Inactive/archived students retain historical attendance logs.';
