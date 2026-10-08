-- ==============================================================================
-- MedAttend PostgreSQL Migration 01: Enforce Unique Attendance per Session
-- ==============================================================================
-- 1. Remove duplicate attendance rows if any exist, keeping the latest timestamp
DELETE FROM attendance a USING attendance b
WHERE a.id < b.id 
  AND a.session_id = b.session_id 
  AND a.student_id = b.student_id;

-- 2. Create Unique Index to enforce hardware-level uniqueness for (session_id, student_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_session_student_unique 
ON attendance (session_id, student_id);

-- 3. Add explicit UNIQUE Constraint if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_session_student'
    ) THEN
        ALTER TABLE attendance ADD CONSTRAINT unique_session_student UNIQUE (session_id, student_id);
    END IF;
END $$;
