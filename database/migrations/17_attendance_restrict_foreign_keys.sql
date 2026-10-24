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
