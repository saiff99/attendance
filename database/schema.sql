-- ==============================================================================
-- 🎓 Supabase Production Schema for Smart Attendance System (MedAttend AI)
-- ==============================================================================

-- 1. Enable uuid-ossp extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table: students
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_roll VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    academic_year VARCHAR(50) DEFAULT '1st Year',
    parent_phone VARCHAR(50),
    face_encoding JSONB, -- Stores 512D vector embeddings for InsightFace ArcFace recognition
    manual_marked_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table: sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    instructor_name VARCHAR(255) NOT NULL,
    target_academic_year VARCHAR(50) DEFAULT 'All',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table: attendance
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Present', 'Absent')),
    capture_mode VARCHAR(50) NOT NULL CHECK (capture_mode IN ('Live Scan', 'Manual Upload', 'Selfie Scan', 'Manual Entry')),
    confidence_score FLOAT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_session_student UNIQUE(session_id, student_id) -- Database-level duplicate prevention
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_students_roll ON students(student_roll);
CREATE INDEX IF NOT EXISTS idx_students_year ON students(academic_year);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_sessions_year ON sessions(target_academic_year);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_at ON attendance(recorded_at);

-- ==============================================================================
-- 6. Row Level Security (RLS) & Protection Policies
-- ==============================================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Students Policies
CREATE POLICY "service_role_full_students" ON students FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_read_students" ON students FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "allow_insert_students" ON students FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "allow_update_students" ON students FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_students" ON students FOR DELETE TO authenticated, service_role USING (true);

-- Sessions Policies
CREATE POLICY "service_role_full_sessions" ON sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_read_sessions" ON sessions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "allow_insert_sessions" ON sessions FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "allow_update_sessions" ON sessions FOR UPDATE TO authenticated, anon USING (id != '00000000-0000-0000-0000-000000000000') WITH CHECK (id != '00000000-0000-0000-0000-000000000000');
CREATE POLICY "allow_delete_sessions" ON sessions FOR DELETE TO authenticated, service_role USING (true);

-- Attendance Policies
CREATE POLICY "service_role_full_attendance" ON attendance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "allow_read_attendance" ON attendance FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "allow_insert_attendance" ON attendance FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "allow_update_attendance" ON attendance FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_attendance" ON attendance FOR DELETE TO authenticated, service_role USING (true);
