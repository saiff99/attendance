-- ==============================================================================
-- 📜 Supabase Migration 20: High-Velocity Partial & Composite Performance Indexes
-- ==============================================================================
-- 1. Accelerates active session polling and ongoing monitor lookups
--    by isolating unarchived sessions in a lean partial B-Tree index (<10KB).
-- 2. Eliminates heap table sequential scans for student attendance history
--    by indexing (student_id, recorded_at DESC) for Index-Only scans.
-- 3. Optimizes biometric vector retrieval for live streams and classroom photo scans
--    by indexing active consented student cohorts with non-null embeddings.
-- ==============================================================================

-- 1. Partial index for active session chronological lookups
CREATE INDEX IF NOT EXISTS idx_sessions_active_created 
ON public.sessions (created_at DESC) 
WHERE is_archived = false;

-- 2. Composite index for student attendance history & portal queries
CREATE INDEX IF NOT EXISTS idx_attendance_student_recorded 
ON public.attendance (student_id, recorded_at DESC);

-- 3. Partial index for active biometric enrollment by cohort
CREATE INDEX IF NOT EXISTS idx_students_active_biometric_cohort 
ON public.students (academic_year) 
WHERE is_active = true AND biometric_consent = true AND face_encoding IS NOT NULL;

-- 4. Baseline soft-delete index alignment
CREATE INDEX IF NOT EXISTS idx_sessions_is_archived ON public.sessions (is_archived);
CREATE INDEX IF NOT EXISTS idx_students_is_active ON public.students (is_active);

-- Comments and documentation
COMMENT ON INDEX idx_sessions_active_created IS 'Partial index accelerating active unarchived session polling and ongoing monitor.';
COMMENT ON INDEX idx_attendance_student_recorded IS 'Composite index enabling Index-Only scans for student attendance history.';
COMMENT ON INDEX idx_students_active_biometric_cohort IS 'Partial index accelerating centralized biometric cache warming for active consented cohorts.';
