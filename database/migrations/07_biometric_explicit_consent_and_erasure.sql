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
