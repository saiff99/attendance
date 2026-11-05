-- ==============================================================================
-- 📜 Supabase Migration 21: High-Performance Server-Side Attendance Aggregation RPC
-- ==============================================================================
-- 1. Eliminates client-side looping and 50,000-row chunked sequential API fetching.
-- 2. Aggregates student attendance counts (Present, Manual, Attended Session IDs, Last Seen)
--    directly in PostgreSQL using native B-tree indexes and single-pass GROUP BY.
-- 3. Reduces network payload by ~99.7% (from ~20MB raw JSON to ~40KB summary).
-- ==============================================================================

-- 1. Create High-Performance Attendance Aggregation RPC
CREATE OR REPLACE FUNCTION public.get_attendance_summary(
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    present BIGINT,
    manual BIGINT,
    attended_session_ids UUID[],
    last_attended_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        a.student_id,
        COUNT(*) FILTER (WHERE a.status = 'Present') AS present,
        COUNT(*) FILTER (
            WHERE a.status = 'Present' 
            AND (a.capture_mode = 'Manual Upload' OR a.capture_mode = 'Manual Entry')
        ) AS manual,
        COALESCE(
            ARRAY_AGG(DISTINCT a.session_id) FILTER (WHERE a.status = 'Present' AND a.session_id IS NOT NULL),
            ARRAY[]::UUID[]
        ) AS attended_session_ids,
        MAX(a.recorded_at) FILTER (WHERE a.status = 'Present') AS last_attended_at
    FROM public.attendance a
    WHERE 
        (p_start_date IS NULL OR a.recorded_at >= p_start_date)
        AND (p_end_date IS NULL OR a.recorded_at <= p_end_date)
    GROUP BY a.student_id;
$$;

-- 2. Grant execution privileges to authenticated users & service role
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- 3. Composite Index on (recorded_at, status) to optimize date-range filtered scans
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_status 
ON public.attendance (recorded_at, status);

-- 4. Document RPC function
COMMENT ON FUNCTION public.get_attendance_summary(TIMESTAMPTZ, TIMESTAMPTZ) IS 
'High-performance server-side aggregation for attendance reports. Groups presence, manual overrides, and attended session IDs per student in a single query.';

