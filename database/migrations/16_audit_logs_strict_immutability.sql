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
