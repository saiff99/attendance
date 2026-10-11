-- ==============================================================================
-- 📚 Supabase Migration: Create academic_subjects Table
-- Allows Super Admin to dynamically configure curriculum subjects per academic year
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.academic_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year TEXT NOT NULL, -- '1st Year', '2nd Year', '3rd Year', '4th Year'
    name TEXT NOT NULL,
    code TEXT,
    department TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_academic_subjects_year ON public.academic_subjects (academic_year);
CREATE INDEX IF NOT EXISTS idx_academic_subjects_name ON public.academic_subjects (name);

-- Row Level Security (RLS)
ALTER TABLE public.academic_subjects ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated and public users (so faculties can view in dropdown)
CREATE POLICY "Allow public read of academic_subjects"
    ON public.academic_subjects
    FOR SELECT
    USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to academic_subjects"
    ON public.academic_subjects
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Seed standard initial MBBS curriculum subjects
INSERT INTO public.academic_subjects (academic_year, name, code) VALUES
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
    ('4th Year', 'Obstetrics & Gynaecology', 'OBG');
