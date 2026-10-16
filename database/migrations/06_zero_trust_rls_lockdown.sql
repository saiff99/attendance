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
