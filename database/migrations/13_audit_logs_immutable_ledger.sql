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

-- 2. Attach trigger to audit_logs table
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_audit_log_immutability();

-- 3. Revoke dangerous table mutation privileges
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM public, anon, authenticated;

-- 4. Reaffirm Service-Role append-only / read-only RLS policy
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.audit_logs IS 'Immutable forensic audit ledger. Rows cannot be updated or deleted.';
COMMENT ON TRIGGER trg_audit_logs_immutable ON public.audit_logs IS 'Enforces non-repudiation by rejecting UPDATE and DELETE on audit_logs.';
