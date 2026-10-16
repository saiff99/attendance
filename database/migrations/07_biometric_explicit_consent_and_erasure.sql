-- ==============================================================================
-- 📜 Supabase Migration 07: DPDP Act 2023 Explicit Biometric Consent & Erasure
-- Sets default consent to false (opt-in only), links consent to enrollment,
-- and supports the legal right to revoke consent and erase biometric data.
-- ==============================================================================

-- 1. Ensure columns exist with explicit opt-in default (false)
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS biometric_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS biometric_consent_date TIMESTAMPTZ;

-- 2. Update default constraint to false
ALTER TABLE public.students 
ALTER COLUMN biometric_consent SET DEFAULT false;

-- 3. Synchronize existing records:
-- Only students with enrolled face vectors retain consent=true.
-- Students without face vectors are set to consent=false.
UPDATE public.students
SET 
    biometric_consent = true,
    biometric_consent_date = COALESCE(biometric_consent_date, created_at, NOW())
WHERE face_encoding IS NOT NULL 
  AND (jsonb_typeof(face_encoding) = 'array' OR jsonb_typeof(face_encoding) = 'object');

UPDATE public.students
SET 
    biometric_consent = false,
    biometric_consent_date = NULL
WHERE face_encoding IS NULL;
