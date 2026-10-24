-- ==============================================================================
-- 📜 Supabase Migration 19: Authoritative Archive Data Model Synchronization
-- Backfill & Align is_archived and is_active Flags with Audit Timestamps
-- ==============================================================================
-- 1. Ensures is_archived and archived_at columns exist on public.sessions.
-- 2. Ensures is_active and archived_at columns exist on public.students.
-- 3. Synchronizes historical [ARCHIVED] tagged sessions with authoritative is_archived = true.
-- 4. Synchronizes historical [ARCHIVED] tagged students with authoritative is_active = false.
-- 5. Sets archived_at timestamps for all soft-deleted records where missing.
-- 6. Ensures consistent single-model filtering across all APIs (list, login, biometric, reports).
-- ==============================================================================

-- 1. Ensure archival and soft-delete columns exist on public.sessions
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 2. Ensure archival and soft-delete columns exist on public.students
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 3. Ensure performance indexes exist
CREATE INDEX IF NOT EXISTS idx_sessions_is_archived ON public.sessions (is_archived);
CREATE INDEX IF NOT EXISTS idx_students_is_active ON public.students (is_active);

-- 4. Backfill legacy archived sessions
UPDATE public.sessions
SET is_archived = true,
    archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
WHERE (class_name LIKE '[ARCHIVED]%' OR target_academic_year = 'Archived')
  AND is_archived IS DISTINCT FROM true;

-- 5. Backfill legacy archived students
UPDATE public.students
SET is_active = false,
    archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
WHERE academic_year LIKE '[ARCHIVED]%'
  AND is_active IS DISTINCT FROM false;

-- 6. Comments and documentation
COMMENT ON COLUMN public.sessions.is_archived IS 'Authoritative soft-delete flag. Archived sessions cannot be used for new attendance.';
COMMENT ON COLUMN public.students.is_active IS 'Authoritative student roster flag. Inactive/archived students cannot log in or check in.';
