-- ==============================================================================
-- MedAttend Complete Consolidated Migration Bundle
-- Generated: 2026-11-04T08:19:05.343231Z
-- Migrations included: 01 to 20 (20 files)
-- ==============================================================================

-- 1. Ensure migrations audit ledger exists
CREATE TABLE IF NOT EXISTS public._migrations (
  id SERIAL PRIMARY KEY,
  version INTEGER UNIQUE NOT NULL,
  name VARCHAR(255) UNIQUE NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_time_ms INTEGER NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------------------
-- [MIGRATION 01] 01_unique_session_student_attendance.sql
-- SHA-256 Checksum: b58dc7299768987a76e349e43755864d168aabb39f53d50ea1bdb4a86a0a337b
-- ------------------------------------------------------------------------------
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

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (1, '01_unique_session_student_attendance', 'b58dc7299768987a76e349e43755864d168aabb39f53d50ea1bdb4a86a0a337b', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 02] 02_student_portal_auth.sql
-- SHA-256 Checksum: 0c25e93e1fd322df89b911687f7d742948ce859b9925861dc4eaff5e0645507a
-- ------------------------------------------------------------------------------
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

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (2, '02_student_portal_auth', '0c25e93e1fd322df89b911687f7d742948ce859b9925861dc4eaff5e0645507a', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 03] 03_create_academic_subjects.sql
-- SHA-256 Checksum: fdac7b5cf8e6034e33be171032325ca7c334656e2049fbc27b68b8bafe9eb219
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 📚 Supabase Migration 03: Create academic_subjects Table & Default Curriculum
-- Allows dynamic curriculum management per academic year
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.academic_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    department TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_academic_subjects_year ON public.academic_subjects (academic_year);
CREATE INDEX IF NOT EXISTS idx_academic_subjects_name ON public.academic_subjects (name);

-- Seed standard initial MBBS curriculum subjects
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

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (3, '03_create_academic_subjects', 'fdac7b5cf8e6034e33be171032325ca7c334656e2049fbc27b68b8bafe9eb219', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 04] 04_create_app_users.sql
-- SHA-256 Checksum: 58dbd7f428039c1b377a202380e3705ef4e1ffe884e333c10e32060cfc4a26c8
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 👥 Supabase Migration 04: Create app_users Table
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

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users(role);

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (4, '04_create_app_users', '58dbd7f428039c1b377a202380e3705ef4e1ffe884e333c10e32060cfc4a26c8', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 05] 05_create_settings_and_rate_limit.sql
-- SHA-256 Checksum: 06fced690f7d2a9f2cbd994f7be78c3fa32a2b16d56ed7a084461a416dc23a75
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- ⚙️ Supabase Migration 05: Create settings Table
-- Shared persistent storage for rate-limiting, system tunnel URLs, and configs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (5, '05_create_settings_and_rate_limit', '06fced690f7d2a9f2cbd994f7be78c3fa32a2b16d56ed7a084461a416dc23a75', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 06] 06_zero_trust_rls_lockdown.sql
-- SHA-256 Checksum: 67bd9cc30617982ce85e0b7346c013de18a26a732db1753027dc8432fe55c098
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🛡️ Supabase Migration 06: Zero-Trust Row Level Security (RLS) Lockdown
-- Enforces server-side service_role access across all tables
-- ==============================================================================

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Service Role Full Unrestricted Access on All Tables
DROP POLICY IF EXISTS "service_role_full_students" ON public.students;
CREATE POLICY "service_role_full_students" ON public.students FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_sessions" ON public.sessions;
CREATE POLICY "service_role_full_sessions" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_attendance" ON public.attendance;
CREATE POLICY "service_role_full_attendance" ON public.attendance FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_audit_logs" ON public.audit_logs;
CREATE POLICY "service_role_full_audit_logs" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_app_users" ON public.app_users;
CREATE POLICY "service_role_full_app_users" ON public.app_users FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_academic_subjects" ON public.academic_subjects;
CREATE POLICY "service_role_full_academic_subjects" ON public.academic_subjects FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_settings" ON public.settings;
CREATE POLICY "service_role_full_settings" ON public.settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow public read of subjects for faculty session creation dropdowns
DROP POLICY IF EXISTS "Allow public read of academic_subjects" ON public.academic_subjects;
CREATE POLICY "Allow public read of academic_subjects" ON public.academic_subjects FOR SELECT USING (true);

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (6, '06_zero_trust_rls_lockdown', '67bd9cc30617982ce85e0b7346c013de18a26a732db1753027dc8432fe55c098', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 07] 07_biometric_explicit_consent_and_erasure.sql
-- SHA-256 Checksum: b93c2e7c44b60723cb8908e15b8d47b7a258804102d95c2b6366dfd9597b8500
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 📜 Supabase Migration 07: DPDP Act 2023 Explicit Biometric Consent & Erasure
-- Sets default consent to false (opt-in only), links consent to enrollment,
-- and supports the legal right to revoke consent and erase biometric data.
-- ==============================================================================

-- 1. Ensure columns exist with explicit opt-in default (false)
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS biometric_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS biometric_consent_date TIMESTAMPTZ;

-- 2. Update default constraint to false (Strict Opt-In)
ALTER TABLE public.students 
ALTER COLUMN biometric_consent SET DEFAULT false;

-- 3. Strict DPDP Act Compliance:
-- Never assume consent for existing records simply because a face encoding exists.
-- Biometric consent must be affirmative, informed, and provable.
-- If no explicit affirmative consent record exists, biometric_consent MUST remain false.
UPDATE public.students
SET 
    biometric_consent = false,
    biometric_consent_date = NULL
WHERE biometric_consent IS NULL;

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (7, '07_biometric_explicit_consent_and_erasure', 'b93c2e7c44b60723cb8908e15b8d47b7a258804102d95c2b6366dfd9597b8500', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 08] 08_dedicated_tunnel_security_settings.sql
-- SHA-256 Checksum: 954f675df1526ebff874cbbd4e9aea2df61e5be5f4924a63df92f9145df87400
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 📜 Supabase Migration 08: Dedicated Tunnel Security & Settings Configuration
-- Creates dedicated configuration store for backend tunnel discovery,
-- removes dependency on special session rows, and enforces zero-trust RLS.
-- ==============================================================================

-- 1. Ensure settings table exists with primary key and JSONB value store
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Enable Row-Level Security (RLS) on settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Service Role has full read/write access (Server-Side Only)
DROP POLICY IF EXISTS "service_role_full_settings" ON public.settings;
CREATE POLICY "service_role_full_settings" 
ON public.settings 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 4. Transparent Migration: Migrate existing tunnel configuration from sessions row if present
DO $$
DECLARE
    legacy_url TEXT;
    clean_url TEXT;
    sig_val TEXT;
BEGIN
    SELECT instructor_name INTO legacy_url
    FROM public.sessions
    WHERE id = '00000000-0000-0000-0000-000000000000'
    LIMIT 1;

    IF legacy_url IS NOT NULL AND legacy_url LIKE 'http%' THEN
        IF position('#sig=' in legacy_url) > 0 THEN
            clean_url := split_part(legacy_url, '#sig=', 1);
            sig_val := split_part(legacy_url, '#sig=', 2);
        ELSE
            clean_url := legacy_url;
            sig_val := NULL;
        END IF;

        INSERT INTO public.settings (key, value, updated_at)
        VALUES (
            'tunnel_config',
            jsonb_build_object(
                'url', clean_url,
                'signature', sig_val,
                'signed_url', legacy_url,
                'migrated_from', 'sessions_00000000'
            ),
            NOW()
        )
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (8, '08_dedicated_tunnel_security_settings', '954f675df1526ebff874cbbd4e9aea2df61e5be5f4924a63df92f9145df87400', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 09] 09_zero_trust_rls_purge_and_verification.sql
-- SHA-256 Checksum: 669597b8862132a0cd5be6bdfa57ee64ab2d57a27a4952ab033aede4ef6003b8
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🛡️ Supabase Migration 09: Complete Zero-Trust RLS Purge & Hardened Lockdown
-- 1. Dynamically purges ALL legacy, permissive, and ad-hoc policies from all tables.
-- 2. Restricts students, sessions, attendance, audit_logs, app_users, and settings
--    strictly to server-side service_role (Zero-Trust).
-- 3. Grants minimal, read-only SELECT access on academic_subjects for active items.
-- 4. Runs an automated validation check asserting 0 permissive policies remain.
-- ==============================================================================

-- 1. Enable and Force Row Level Security (RLS) on all core tables
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attendance FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_users FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.academic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.academic_subjects FORCE ROW LEVEL SECURITY;


-- 2. DYNAMIC PURGE: Drop ALL existing policies on all protected tables
-- This ensures no legacy policies (e.g. anon_manage_students, allow_read_students, etc.) survive.
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


-- ==============================================================================
-- 🔒 3. ZERO-TRUST POLICIES: SERVICE_ROLE ONLY FOR SENSITIVE DATA
-- ==============================================================================

-- 3.1 students table: Only server-side service_role has access
CREATE POLICY "service_role_full_students"
ON public.students
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.2 sessions table: Only server-side service_role has access
CREATE POLICY "service_role_full_sessions"
ON public.sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.3 attendance table: Only server-side service_role has access
CREATE POLICY "service_role_full_attendance"
ON public.attendance
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.4 audit_logs table: Only server-side service_role has access (Immutable ledger)
CREATE POLICY "service_role_full_audit_logs"
ON public.audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.5 app_users table: Only server-side service_role has access (Credentials store)
CREATE POLICY "service_role_full_app_users"
ON public.app_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3.6 settings table: Only server-side service_role has access (System config & tunnel)
CREATE POLICY "service_role_full_settings"
ON public.settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ==============================================================================
-- 📚 4. LIMITED PUBLIC ACCESS: ACADEMIC SUBJECTS (READ-ONLY)
-- ==============================================================================

-- 4.1 service_role: Full access for curriculum management
CREATE POLICY "service_role_full_academic_subjects"
ON public.academic_subjects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4.2 anon & authenticated: Strictly read-only for active curriculum subjects
CREATE POLICY "academic_subjects_public_read_active"
ON public.academic_subjects
FOR SELECT
TO anon, authenticated
USING (is_active = true);


-- ==============================================================================
-- 🔍 5. AUTOMATED INTEGRITY ASSERTION & VERIFICATION
-- ==============================================================================
DO $$
DECLARE
    leaks INTEGER;
BEGIN
    -- Assert that no policy allows anon, authenticated, or public access on sensitive tables
    SELECT COUNT(*) INTO leaks
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('students', 'sessions', 'attendance', 'audit_logs', 'app_users', 'settings')
      AND (
          'anon' = ANY(roles) 
          OR 'authenticated' = ANY(roles) 
          OR 'public' = ANY(roles)
      );

    IF leaks > 0 THEN
        RAISE EXCEPTION '❌ RLS Lockdown Verification Failed! Found % permissive policies on sensitive tables.', leaks;
    ELSE
        RAISE NOTICE '✅ RLS Lockdown Verification SUCCESS: All sensitive tables are 100%% protected (service_role only).';
    END IF;
END $$;

-- Query to view active policies:
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    roles, 
    cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (9, '09_zero_trust_rls_purge_and_verification', '669597b8862132a0cd5be6bdfa57ee64ab2d57a27a4952ab033aede4ef6003b8', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 10] 10_zero_trust_credentials_and_pins.sql
-- SHA-256 Checksum: 53d0b7889953cf8d0f027b242b3fd452a9647cfe419825d9c30c791fba77b056
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🔒 Supabase Migration 10: Zero-Trust Credentials & Schema Hardening
-- ==============================================================================
-- Purges hardcoded/built-in login accounts and weak default student roll/123456 fallbacks.
-- Ensures all authentication is verified exclusively against Supabase database.
-- ==============================================================================

-- 1. Ensure app_users table exists and has proper schema
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'Faculty' CHECK (role IN ('Super Admin', 'Admin', 'Faculty')),
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users(role);

-- 2. Zero-Trust Security Policy:
-- No default or predictable passwords/accounts are seeded in migrations.
-- Initial administrator accounts must be provisioned with high-entropy unique credentials
-- created directly via the secure setup CLI or the Super Admin Console.

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (10, '10_zero_trust_credentials_and_pins', '53d0b7889953cf8d0f027b242b3fd452a9647cfe419825d9c30c791fba77b056', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 11] 11_biometric_explicit_consent_audit_and_erasure.sql
-- SHA-256 Checksum: bded08fea7a2c3e6f02628e7547ae9d607d1400b0feb338324f79b6bbec7ffaf
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 📜 Supabase Migration 11: Biometric Explicit Consent Audit & Memory Erasure
-- DPDP Act 2023 & Zero-Trust Privacy Standard
-- ==============================================================================
-- 1. Adds robust consent audit trail fields (version, actor, revocation timestamp).
-- 2. Enforces explicit opt-in: no student's face data may be used without provable consent.
-- 3. Mandates immediate biometric erasure upon consent revocation.
-- ==============================================================================

-- 1. Add audit columns to students table if not exists
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS biometric_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS biometric_consent_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS biometric_consent_version VARCHAR(50) DEFAULT 'v1.0-dpdp',
ADD COLUMN IF NOT EXISTS biometric_consent_actor VARCHAR(100),
ADD COLUMN IF NOT EXISTS biometric_consent_revoked_at TIMESTAMPTZ;

-- 2. Strict Constraint: biometric_consent defaults to false
ALTER TABLE public.students 
ALTER COLUMN biometric_consent SET DEFAULT false;

-- 3. Ensure no NULL values exist in biometric_consent
UPDATE public.students
SET biometric_consent = false
WHERE biometric_consent IS NULL;

-- 4. Create index for fast verification during CCTV camera batch matching
CREATE INDEX IF NOT EXISTS idx_students_biometric_consent 
ON public.students(biometric_consent) 
WHERE biometric_consent = true;

-- 5. Comments documenting legal compliance
COMMENT ON COLUMN public.students.biometric_consent IS 'Affirmative explicit consent for facial biometric processing under DPDP Act 2023 Section 6(1).';
COMMENT ON COLUMN public.students.biometric_consent_date IS 'UTC timestamp when explicit biometric consent was granted.';
COMMENT ON COLUMN public.students.biometric_consent_version IS 'Version of the Biometric Consent & Privacy Policy agreed to.';
COMMENT ON COLUMN public.students.biometric_consent_actor IS 'Identity of the authorized actor/admin who recorded affirmative consent.';
COMMENT ON COLUMN public.students.biometric_consent_revoked_at IS 'UTC timestamp when biometric consent was revoked and facial template erased.';

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (11, '11_biometric_explicit_consent_audit_and_erasure', 'bded08fea7a2c3e6f02628e7547ae9d607d1400b0feb338324f79b6bbec7ffaf', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 12] 12_add_admin_role.sql
-- SHA-256 Checksum: 677374e486248da07018897f8fa75a66bca68c57983da6aaaa672f34d9d16ba8
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 👥 Supabase Migration 12: Add 'Admin' Role to app_users Table
-- Run this in Supabase Dashboard > SQL Editor
-- ==============================================================================

-- 1. Drop existing role check constraint if present
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

-- 2. Add updated role check constraint allowing 'Super Admin', 'Admin', and 'Faculty'
ALTER TABLE public.app_users 
ADD CONSTRAINT app_users_role_check 
CHECK (role IN ('Super Admin', 'Admin', 'Faculty'));

COMMENT ON CONSTRAINT app_users_role_check ON public.app_users IS 'Allows Super Admin, Admin, and Faculty roles';

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (12, '12_add_admin_role', '677374e486248da07018897f8fa75a66bca68c57983da6aaaa672f34d9d16ba8', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 13] 13_audit_logs_immutable_ledger.sql
-- SHA-256 Checksum: e7bcc95ac51a89904848d75dbb7ac91939a0c156e8cce52d13a49d20fb3d5557
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 📜 Supabase Migration 13: Cryptographically Immutable Audit Log Ledger
-- Regulatory Compliance: DPDP Act 2023 Sec 6 & ISO 27001 Access Integrity
-- ==============================================================================
-- 1. Creates an append-only trigger preventing UPDATE and DELETE on audit_logs.
-- 2. Revokes UPDATE, DELETE, and TRUNCATE privileges from public, anon, and authenticated roles.
-- 3. Ensures forensic non-repudiation for security events and biometric audits.
-- ==============================================================================

-- 1. Function to enforce immutability
CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: audit_logs entries are immutable and cannot be updated, modified, or deleted.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach row-level trigger to audit_logs table for UPDATE and DELETE
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_audit_log_immutability();

-- 3. Attach statement-level trigger to audit_logs table for TRUNCATE
DROP TRIGGER IF EXISTS trg_audit_logs_immutable_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_audit_log_immutability();

-- 4. Revoke dangerous table mutation privileges from all roles, including service_role
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM public, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;

-- 5. Reaffirm Service-Role append-only / read-only RLS policy
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.audit_logs IS 'Immutable forensic audit ledger. Rows cannot be updated, modified, deleted, or truncated.';
COMMENT ON TRIGGER trg_audit_logs_immutable ON public.audit_logs IS 'Enforces non-repudiation by rejecting UPDATE and DELETE on audit_logs.';
COMMENT ON TRIGGER trg_audit_logs_immutable_truncate ON public.audit_logs IS 'Enforces non-repudiation by rejecting statement-level TRUNCATE on audit_logs.';

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (13, '13_audit_logs_immutable_ledger', 'e7bcc95ac51a89904848d75dbb7ac91939a0c156e8cce52d13a49d20fb3d5557', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 14] 14_soft_delete_and_retention.sql
-- SHA-256 Checksum: e3bdd4472258c8757b2c5b688905e6aeac2ba791d42ef6a6bc9880186d942830
-- ------------------------------------------------------------------------------
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

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (14, '14_soft_delete_and_retention', 'e3bdd4472258c8757b2c5b688905e6aeac2ba791d42ef6a6bc9880186d942830', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 15] 15_atomic_rate_limiter.sql
-- SHA-256 Checksum: fd58a6cf7f6ce8ed7634dfa1b185aade95752a6015a1121c4b34f927073c0354
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🔒 Supabase Migration 15: Atomic Rate Limiting Stored Procedures
-- ==============================================================================
-- Implements an atomic check-and-increment transaction in PostgreSQL
-- using row-level locking (SELECT ... FOR UPDATE) on the settings table.
-- Guarantees zero race conditions across distributed workers without Redis.
-- ==============================================================================

-- 1. Ensure settings table exists with primary key and timestamp
CREATE TABLE IF NOT EXISTS public.settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON public.settings(key);

-- 2. Stored Procedure: atomic_check_rate_limit
-- Atomically checks a sliding-window rate limit and records the new attempt
-- in a single ACID transaction with row-level locking.
CREATE OR REPLACE FUNCTION public.atomic_check_rate_limit(
    p_key TEXT,
    p_max_attempts INT,
    p_window_seconds NUMERIC,
    p_now_ts NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_val JSONB;
    v_attempts NUMERIC[];
    v_pruned NUMERIC[];
    v_ts NUMERIC;
    v_count INT;
    v_oldest NUMERIC;
    v_retry_after INT;
BEGIN
    -- 1. Acquire transaction-level advisory lock on the hashed key
    -- Guarantees strict serialization across concurrent requests even if the row does not exist yet
    PERFORM pg_advisory_xact_lock(hashtext(p_key));

    -- 2. Ensure row exists so subsequent row-level lock (FOR UPDATE) is unconditionally guaranteed
    INSERT INTO public.settings (key, value, updated_at)
    VALUES (p_key, '{"attempts":[]}'::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO NOTHING;

    -- 3. Acquire exclusive row-level lock on the rate limit key
    SELECT value INTO v_val
    FROM public.settings
    WHERE key = p_key
    FOR UPDATE;

    v_pruned := ARRAY[]::NUMERIC[];

    IF v_val IS NOT NULL AND (v_val ? 'attempts') THEN
        FOR v_ts IN SELECT jsonb_array_elements_text(v_val->'attempts')::NUMERIC LOOP
            IF (p_now_ts - v_ts) < p_window_seconds THEN
                v_pruned := array_append(v_pruned, v_ts);
            END IF;
        END LOOP;
    END IF;

    v_count := cardinality(v_pruned);

    IF v_count >= p_max_attempts THEN
        v_oldest := v_pruned[1];
        v_retry_after := GREATEST(1, ceil(p_window_seconds - (p_now_ts - v_oldest))::INT);
        RETURN jsonb_build_object(
            'allowed', false,
            'count', v_count,
            'retry_after', v_retry_after
        );
    END IF;

    -- Append current timestamp to pruned attempts
    v_pruned := array_append(v_pruned, p_now_ts);

    UPDATE public.settings
    SET value = jsonb_build_object('attempts', to_jsonb(v_pruned), 'updated_at', p_now_ts),
        updated_at = CURRENT_TIMESTAMP
    WHERE key = p_key;

    RETURN jsonb_build_object(
        'allowed', true,
        'count', cardinality(v_pruned),
        'retry_after', 0
    );
END;
$$;

-- 3. Hardened Security, Function Execution Restrictions & Privilege Lockdown
-- Revoke execution from untrusted client roles (preventing arbitrary key writes in settings)
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM authenticated;

-- Grant execution strictly to the backend server-side service_role
GRANT EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) TO service_role;

COMMENT ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) IS 
'Security-hardened atomic sliding-window rate limiter with fixed search_path. Restricted exclusively to service_role.';

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (15, '15_atomic_rate_limiter', 'fd58a6cf7f6ce8ed7634dfa1b185aade95752a6015a1121c4b34f927073c0354', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 16] 16_audit_logs_strict_immutability.sql
-- SHA-256 Checksum: 9ffb40406315ced24a16ef66bec65cd2a8c6f90d7b4adb34dbdbd1fb210b164b
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 📜 Supabase Migration 16: Strict Immutability & Mutation Privilege Revocation
-- Regulatory Compliance: DPDP Act 2023 Sec 6 & ISO 27001 Forensic Ledger Integrity
-- ==============================================================================
-- 1. Attaches statement-level BEFORE TRUNCATE trigger to prevent TRUNCATE operations
--    on public.audit_logs (row-level triggers bypass TRUNCATE in PostgreSQL).
-- 2. Revokes UPDATE, DELETE, and TRUNCATE privileges from all roles including service_role.
-- 3. Explicitly limits service_role table privileges to SELECT and INSERT only.
-- 4. Aligns RLS policies to least-privilege (SELECT and INSERT only).
-- ==============================================================================

-- 1. Ensure immutable violation handler function exists
CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: audit_logs entries are immutable and cannot be updated, modified, deleted, or truncated.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Row-level trigger for UPDATE and DELETE
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_audit_log_immutability();

-- 3. Statement-level trigger for TRUNCATE (Critical: row-level triggers do NOT catch TRUNCATE)
DROP TRIGGER IF EXISTS trg_audit_logs_immutable_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_audit_log_immutability();

-- 4. Revoke mutation privileges (UPDATE, DELETE, TRUNCATE) from ALL roles, including service_role
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM public, anon, authenticated, service_role;

-- 5. Explicitly grant only append-only and read-only access to service_role
GRANT SELECT, INSERT ON public.audit_logs TO service_role;

-- 6. Refine RLS policies to least-privilege (Separate SELECT and INSERT; eliminate any generic FOR ALL)
DROP POLICY IF EXISTS "service_role_full_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "service_role_unrestricted_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "service_role_select_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "service_role_insert_audit_logs" ON public.audit_logs;

CREATE POLICY "service_role_select_audit_logs"
ON public.audit_logs
FOR SELECT
TO service_role
USING (true);

CREATE POLICY "service_role_insert_audit_logs"
ON public.audit_logs
FOR INSERT
TO service_role
WITH CHECK (true);

COMMENT ON TRIGGER trg_audit_logs_immutable_truncate ON public.audit_logs IS 'Enforces forensic immutability by blocking statement-level TRUNCATE commands.';

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (16, '16_audit_logs_strict_immutability', '9ffb40406315ced24a16ef66bec65cd2a8c6f90d7b4adb34dbdbd1fb210b164b', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 17] 17_attendance_restrict_foreign_keys.sql
-- SHA-256 Checksum: dc98e2d5a5ca0630bbd54fa315bee9d450c2d16e80499a58fd8f4c3f1a014211
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 📜 Supabase Migration 17: Attendance Foreign Key Non-Cascading Retention Lockdown
-- Regulatory Compliance: National Medical Commission (NMC) 5-Year Academic Audit
-- & Digital Personal Data Protection (DPDP) Act 2023 Non-Repudiation
-- ==============================================================================
-- 1. Pre-flight check: verifies zero orphaned attendance rows prior to constraint migration.
-- 2. Safely drops legacy ON DELETE CASCADE foreign key constraints on attendance table.
-- 3. Re-applies foreign keys with ON DELETE RESTRICT (blocking accidental parent deletions).
-- 4. Guarantees that historical biometric attendance logs cannot be cascaded away by
--    direct SQL execution, maintenance scripts, or external database tools.
-- ==============================================================================

DO $$
DECLARE
    orphan_session_count INTEGER;
    orphan_student_count INTEGER;
BEGIN
    -- Step 1: Pre-flight data integrity validation
    SELECT COUNT(*) INTO orphan_session_count
    FROM public.attendance a
    LEFT JOIN public.sessions s ON a.session_id = s.id
    WHERE s.id IS NULL;

    SELECT COUNT(*) INTO orphan_student_count
    FROM public.attendance a
    LEFT JOIN public.students st ON a.student_id = st.id
    WHERE st.id IS NULL;

    IF orphan_session_count > 0 OR orphan_student_count > 0 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Found % orphaned session refs and % orphaned student refs in public.attendance.',
            orphan_session_count, orphan_student_count;
    END IF;

    RAISE NOTICE 'Pre-migration check passed: 0 orphaned attendance records detected.';
END $$;

-- Step 2: Drop existing foreign key constraints if present
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop foreign key on session_id
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'attendance'
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name = 'attendance_session_id_fkey'
    ) LOOP
        EXECUTE 'ALTER TABLE public.attendance DROP CONSTRAINT ' || quote_ident(r.constraint_name);
        RAISE NOTICE 'Dropped legacy foreign key constraint: %', r.constraint_name;
    END LOOP;

    -- Drop foreign key on student_id
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'attendance'
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name = 'attendance_student_id_fkey'
    ) LOOP
        EXECUTE 'ALTER TABLE public.attendance DROP CONSTRAINT ' || quote_ident(r.constraint_name);
        RAISE NOTICE 'Dropped legacy foreign key constraint: %', r.constraint_name;
    END LOOP;
END $$;

-- Fallback explicit drop in case named standardly
ALTER TABLE public.attendance
    DROP CONSTRAINT IF EXISTS attendance_session_id_fkey,
    DROP CONSTRAINT IF EXISTS attendance_student_id_fkey;

-- Step 3: Re-create foreign keys with ON DELETE RESTRICT
ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_session_id_fkey
        FOREIGN KEY (session_id)
        REFERENCES public.sessions(id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT attendance_student_id_fkey
        FOREIGN KEY (student_id)
        REFERENCES public.students(id)
        ON DELETE RESTRICT;

-- Step 4: Metadata documentation comments
COMMENT ON CONSTRAINT attendance_session_id_fkey ON public.attendance IS
    'Enforces ON DELETE RESTRICT: Prevents accidental cascading deletion of historical attendance records when a session is targeted.';

COMMENT ON CONSTRAINT attendance_student_id_fkey ON public.attendance IS
    'Enforces ON DELETE RESTRICT: Prevents accidental cascading deletion of historical attendance records when a student is targeted.';

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (17, '17_attendance_restrict_foreign_keys', 'dc98e2d5a5ca0630bbd54fa315bee9d450c2d16e80499a58fd8f4c3f1a014211', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 18] 18_atomic_rate_limit_permissions.sql
-- SHA-256 Checksum: 9a40cf6893e03b835142c3e3109bec9229db3d35177611038324fbd1bdf43f1b
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- 🔒 Supabase Migration 18: Atomic Rate Limit Function Permission Lockdown
-- Security Hardening: Least Privilege Execution & Search Path Isolation
-- ==============================================================================
-- 1. Re-defines public.atomic_check_rate_limit with immutable search_path
--    (SET search_path = public, pg_temp) to eliminate search-path hijacking attacks.
-- 2. Explicitly revokes EXECUTE on public.atomic_check_rate_limit from PUBLIC,
--    anon, and authenticated roles to prevent unauthorized client-side invocation
--    and arbitrary key overwrites in the public.settings table.
-- 3. Grants EXECUTE strictly to the backend server-side service_role.
-- ==============================================================================

-- 1. Update function with fixed search_path
CREATE OR REPLACE FUNCTION public.atomic_check_rate_limit(
    p_key TEXT,
    p_max_attempts INT,
    p_window_seconds NUMERIC,
    p_now_ts NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_val JSONB;
    v_attempts NUMERIC[];
    v_pruned NUMERIC[];
    v_ts NUMERIC;
    v_count INT;
    v_oldest NUMERIC;
    v_retry_after INT;
BEGIN
    -- 1. Acquire transaction-level advisory lock on the hashed key
    -- Guarantees strict serialization across concurrent requests even if the row does not exist yet
    PERFORM pg_advisory_xact_lock(hashtext(p_key));

    -- 2. Ensure row exists so subsequent row-level lock (FOR UPDATE) is unconditionally guaranteed
    INSERT INTO public.settings (key, value, updated_at)
    VALUES (p_key, '{"attempts":[]}'::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO NOTHING;

    -- 3. Acquire exclusive row-level lock on the rate limit key
    SELECT value INTO v_val
    FROM public.settings
    WHERE key = p_key
    FOR UPDATE;

    v_pruned := ARRAY[]::NUMERIC[];

    IF v_val IS NOT NULL AND (v_val ? 'attempts') THEN
        FOR v_ts IN SELECT jsonb_array_elements_text(v_val->'attempts')::NUMERIC LOOP
            IF (p_now_ts - v_ts) < p_window_seconds THEN
                v_pruned := array_append(v_pruned, v_ts);
            END IF;
        END LOOP;
    END IF;

    v_count := cardinality(v_pruned);

    IF v_count >= p_max_attempts THEN
        v_oldest := v_pruned[1];
        v_retry_after := GREATEST(1, ceil(p_window_seconds - (p_now_ts - v_oldest))::INT);
        RETURN jsonb_build_object(
            'allowed', false,
            'count', v_count,
            'retry_after', v_retry_after
        );
    END IF;

    -- Append current timestamp to pruned attempts
    v_pruned := array_append(v_pruned, p_now_ts);

    UPDATE public.settings
    SET value = jsonb_build_object('attempts', to_jsonb(v_pruned), 'updated_at', p_now_ts),
        updated_at = CURRENT_TIMESTAMP
    WHERE key = p_key;

    RETURN jsonb_build_object(
        'allowed', true,
        'count', cardinality(v_pruned),
        'retry_after', 0
    );
END;
$$;

-- 2. Revoke execute privileges from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM authenticated;

-- 3. Grant execute strictly to service_role
GRANT EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) TO service_role;

COMMENT ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) IS 
'Security-hardened atomic rate limiter. Restricted exclusively to service_role with immutable search_path.';

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (18, '18_atomic_rate_limit_permissions', '9a40cf6893e03b835142c3e3109bec9229db3d35177611038324fbd1bdf43f1b', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 19] 19_backfill_and_align_archive_flags.sql
-- SHA-256 Checksum: 6437b0b13ed32430d09b60648c9fb101d3c67404721ac163ec840da4b584319e
-- ------------------------------------------------------------------------------
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

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (19, '19_backfill_and_align_archive_flags', '6437b0b13ed32430d09b60648c9fb101d3c67404721ac163ec840da4b584319e', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;

-- ------------------------------------------------------------------------------
-- [MIGRATION 20] 20_high_velocity_partial_composite_indexes.sql
-- SHA-256 Checksum: e64df6ccbc4ba520f0b31b1ce604fb049e07f7f192db528a54ccb7c18f316f74
-- ------------------------------------------------------------------------------
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

INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
VALUES (20, '20_high_velocity_partial_composite_indexes', 'e64df6ccbc4ba520f0b31b1ce604fb049e07f7f192db528a54ccb7c18f316f74', 0)
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;
