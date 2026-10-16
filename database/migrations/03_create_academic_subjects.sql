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
