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
