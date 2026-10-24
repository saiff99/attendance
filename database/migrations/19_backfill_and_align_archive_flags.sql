-- ==============================================================================
-- 📜 Supabase Migration 19: Authoritative Archive Data Model Synchronization
-- Backfill & Align is_archived and is_active Flags with Audit Timestamps
-- ==============================================================================
-- 1. Synchronizes historical [ARCHIVED] tagged sessions with authoritative is_archived = true.
-- 2. Synchronizes historical [ARCHIVED] tagged students with authoritative is_active = false.
-- 3. Sets archived_at timestamps for all soft-deleted records where missing.
-- 4. Ensures consistent single-model filtering across all APIs (list, login, biometric, reports).
-- ==============================================================================

-- 1. Backfill legacy archived sessions
UPDATE public.sessions
SET is_archived = true,
    archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
WHERE (class_name LIKE '[ARCHIVED]%' OR target_academic_year = 'Archived')
  AND is_archived IS DISTINCT FROM true;

-- 2. Backfill legacy archived students
UPDATE public.students
SET is_active = false,
    archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
WHERE academic_year LIKE '[ARCHIVED]%'
  AND is_active IS DISTINCT FROM false;

-- 3. Comments and documentation
COMMENT ON COLUMN public.sessions.is_archived IS 'Authoritative soft-delete flag. Archived sessions cannot be used for new attendance.';
COMMENT ON COLUMN public.students.is_active IS 'Authoritative student roster flag. Inactive/archived students cannot log in or check in.';
