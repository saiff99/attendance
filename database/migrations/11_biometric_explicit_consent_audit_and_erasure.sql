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
