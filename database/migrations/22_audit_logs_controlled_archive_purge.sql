-- ==============================================================================
-- 📜 Supabase Migration 22: Controlled Academic Year-End Audit Archival & Safe Purge
-- Regulatory Compliance: DPDP Act 2023 Sec 6 & ISO 27001 Forensic Ledger Lifecycle
-- ==============================================================================
-- 1. Updates enforce_audit_log_immutability() trigger function to allow DELETE only
--    when explicitly authorized via the transaction-scoped session variable 'app.allow_audit_purge'.
-- 2. Creates purge_archived_audit_logs() PostgreSQL stored procedure:
--    - Enforces strict safety guard: cutoff date must be >= 180 days in the past (prevents deleting active logs).
--    - Verifies exact confirmation token 'CONFIRM_FORENSIC_PURGE'.
--    - Deletes archived records prior to cutoff timestamp in a single atomic transaction.
--    - Immutably records the purge event itself in audit_logs with exact purged count and timestamp.
-- 3. Grants EXECUTE privilege strictly to service_role (invoked exclusively via authenticated Super Admin API).
-- ==============================================================================

-- 1. Refine Immutability Trigger to support transaction-scoped purge bypass
CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow controlled forensic purge when explicitly authorized in transaction setting
    IF TG_OP = 'DELETE' AND current_setting('app.allow_audit_purge', true) = 'true' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'SECURITY VIOLATION: audit_logs entries are immutable and cannot be updated, modified, deleted, or truncated.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create Secure Purge Stored Procedure
CREATE OR REPLACE FUNCTION public.purge_archived_audit_logs(
    p_cutoff_timestamp TIMESTAMPTZ,
    p_confirmation TEXT,
    p_admin_id TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INT;
    v_min_allowed_date TIMESTAMPTZ := NOW() - INTERVAL '180 days';
BEGIN
    -- 1. Hard Security Guard: Disallow purging logs newer than 180 days (6 months)
    IF p_cutoff_timestamp > v_min_allowed_date THEN
        RAISE EXCEPTION 'SECURITY GUARD: Cannot purge audit logs newer than 180 days. Provided cutoff (%) is after minimum allowed date (%).',
            p_cutoff_timestamp, v_min_allowed_date;
    END IF;

    -- 2. Explicit Confirmation Token Verification
    IF p_confirmation <> 'CONFIRM_FORENSIC_PURGE' THEN
        RAISE EXCEPTION 'SECURITY ERROR: Invalid confirmation token. Expected CONFIRM_FORENSIC_PURGE.';
    END IF;

    -- 3. Enable local scoped purge bypass for this transaction only
    PERFORM set_config('app.allow_audit_purge', 'true', true);

    -- 4. Delete archived logs prior to cutoff
    DELETE FROM public.audit_logs
    WHERE created_at < p_cutoff_timestamp;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- 5. Immutably record the purge action itself in audit_logs
    INSERT INTO public.audit_logs (
        action,
        actor,
        actor_id,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        'PURGE_ARCHIVED_AUDIT_LOGS',
        'Super Admin',
        COALESCE(p_admin_id, 'admin'),
        'system',
        'audit_logs',
        jsonb_build_object(
            'purged_count', v_deleted_count,
            'cutoff_timestamp', p_cutoff_timestamp,
            'purged_at', NOW()
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', v_deleted_count,
        'cutoff_timestamp', p_cutoff_timestamp
    );
END;
$$;

-- 3. Lock down permissions strictly to service_role
REVOKE ALL ON FUNCTION public.purge_archived_audit_logs(TIMESTAMPTZ, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_archived_audit_logs(TIMESTAMPTZ, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.purge_archived_audit_logs IS 'Safely purges historical audit logs older than 180 days after cold archival, immutably logging the purge operation itself.';
