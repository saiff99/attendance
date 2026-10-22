-- ==============================================================================
-- 🎓 MedAttend AI — Production Database Schema (Supabase PostgreSQL)
-- Complete, Idempotent, Unified Enterprise Schema
-- Includes all 7 Tables, Indexes, Constraints, and Zero-Trust RLS Policies.
-- Safe to run on fresh databases or existing production instances.
-- ==============================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. Table: students
-- Stores enrolled student demographic data, biometric encodings & portal credentials
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_roll VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    academic_year VARCHAR(50) DEFAULT '1st Year',
    parent_phone VARCHAR(50),
    face_encoding JSONB, -- 512D ArcFace vector embeddings for InsightFace recognition
    portal_pin VARCHAR(20), -- Status flag ('TEMP' for temporary single-use PIN, NULL once set by student). Never stores plaintext credentials.
    portal_password_hash TEXT, -- Salted bcrypt hash ($2b$10$...) for student portal authentication
    last_portal_login TIMESTAMPTZ,
    biometric_consent BOOLEAN DEFAULT false, -- DPDP Act 2023: Explicit consent (opt-in only)
    biometric_consent_date TIMESTAMPTZ, -- Timestamp recorded upon explicit enrollment
    manual_marked_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Ensure portal auth columns exist if table was already created by an older migration
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS portal_password_hash TEXT,
ADD COLUMN IF NOT EXISTS portal_pin VARCHAR(20),
ADD COLUMN IF NOT EXISTS last_portal_login TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS biometric_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS biometric_consent_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS manual_marked_count INTEGER DEFAULT 0;

-- ==============================================================================
-- 3. Table: sessions
-- Classroom and clinic attendance sessions created by faculties
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    instructor_name VARCHAR(255) NOT NULL,
    target_academic_year VARCHAR(50) DEFAULT 'All',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 4. Table: attendance
-- Verified biometric & manual attendance logs with duplicate prevention
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Present', 'Absent')),
    capture_mode VARCHAR(50) NOT NULL CHECK (capture_mode IN ('Live Scan', 'Manual Upload', 'Selfie Scan', 'Manual Entry', 'Selfie Check-in')),
    confidence_score FLOAT,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_session_student UNIQUE (session_id, student_id)
);

-- ==============================================================================
-- 5. Table: audit_logs
-- Immutable tamper-evident audit trail for DPDP compliance and security actions
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id VARCHAR(255) DEFAULT 'system_admin',
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 6. Table: app_users
-- Role-based access control (RBAC) for Super Admin and Faculty accounts
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'Faculty' CHECK (role IN ('Super Admin', 'Faculty')),
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMPTZ
);

-- ==============================================================================
-- 7. Table: academic_subjects
-- Dynamic curriculum subjects configured per academic year
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.academic_subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    academic_year TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    department TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 8. Table: settings
-- Persistent shared configuration, rate-limiting lockout store, and tunnel state
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 9. Performance Indexes
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_students_roll ON public.students(student_roll);
CREATE INDEX IF NOT EXISTS idx_students_year ON public.students(academic_year);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON public.sessions(date);
CREATE INDEX IF NOT EXISTS idx_sessions_year ON public.sessions(target_academic_year);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON public.attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_at ON public.attendance(recorded_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users(role);
CREATE INDEX IF NOT EXISTS idx_academic_subjects_year ON public.academic_subjects(academic_year);
CREATE INDEX IF NOT EXISTS idx_academic_subjects_name ON public.academic_subjects(name);

-- ==============================================================================
-- 10. Row Level Security (RLS) & Zero-Trust Production Policies
-- All client interactions are mediated server-side via Next.js API routes & FastAPI
-- using SUPABASE_SERVICE_ROLE_KEY. Anonymous public direct writes and reads are blocked.
-- ==============================================================================
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_subjects FORCE ROW LEVEL SECURITY;

-- Dynamic Purge: Drop all legacy policies across core tables
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('students', 'sessions', 'attendance', 'audit_logs', 'app_users', 'settings', 'academic_subjects')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- Service Role Full Unrestricted Access on All Tables (Server-Side Only)
CREATE POLICY "service_role_full_students" ON public.students FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_sessions" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_attendance" ON public.attendance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_audit_logs" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_app_users" ON public.app_users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_settings" ON public.settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_academic_subjects" ON public.academic_subjects FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Limited read of active curriculum subjects for faculty session creation dropdowns
CREATE POLICY "academic_subjects_public_read_active" 
ON public.academic_subjects 
FOR SELECT 
TO anon, authenticated 
USING (is_active = true);

-- ==============================================================================
-- 11. Seed Data: Default MBBS Curriculum Academic Subjects
-- ==============================================================================
INSERT INTO public.academic_subjects (academic_year, name, code)
SELECT v.year, v.name, v.code
FROM (VALUES
    ('1st Year', 'Anatomy', 'ANAT'),
    ('1st Year', 'Physiology', 'PHYS'),
    ('1st Year', 'Biochemistry', 'BIOC'),
    ('2nd Year', 'Pathology', 'PATH'),
    ('2nd Year', 'Pharmacology', 'PHAR'),
    ('2nd Year', 'Microbiology', 'MICR'),
    ('2nd Year', 'Forensic Medicine & Toxicology', 'FMT'),
    ('3rd Year', 'Ophthalmology', 'OPHT'),
    ('3rd Year', 'ENT (Otorhinolaryngology)', 'ENT'),
    ('3rd Year', 'Community Medicine', 'COMM'),
    ('4th Year', 'General Medicine', 'MED'),
    ('4th Year', 'General Surgery', 'SURG'),
    ('4th Year', 'Pediatrics', 'PED'),
    ('4th Year', 'Obstetrics & Gynaecology', 'OBG')
) AS v(year, name, code)
WHERE NOT EXISTS (
    SELECT 1 FROM public.academic_subjects WHERE name = v.name AND academic_year = v.year
);

-- ==============================================================================
-- 12. Immutable Audit Log Ledger Trigger (DPDP Act 2023 & ISO 27001 Non-Repudiation)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: audit_logs entries are immutable and cannot be updated, modified, or deleted.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_audit_log_immutability();

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM public, anon, authenticated;

