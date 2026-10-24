-- ==============================================================================
-- 🔒 Supabase Migration 18: Atomic Rate Limit Function Permission Lockdown
-- Security Hardening: Least Privilege Execution & Search Path Isolation
-- ==============================================================================
-- 1. Re-defines public.atomic_check_rate_limit with immutable search_path
--    (SET search_path = public, pg_temp) to eliminate search-path hijacking attacks.
-- 2. Explicitly revokes EXECUTE on public.atomic_check_rate_limit from PUBLIC,
--    anon, and authenticated roles to prevent unauthorized client-side invocation
--    and arbitrary key overwrites in the public.settings table.
-- 3. Grants EXECUTE strictly to the backend server-side service_role.
-- ==============================================================================

-- 1. Update function with fixed search_path
CREATE OR REPLACE FUNCTION public.atomic_check_rate_limit(
    p_key TEXT,
    p_max_attempts INT,
    p_window_seconds NUMERIC,
    p_now_ts NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_val JSONB;
    v_attempts NUMERIC[];
    v_pruned NUMERIC[];
    v_ts NUMERIC;
    v_count INT;
    v_oldest NUMERIC;
    v_retry_after INT;
BEGIN
    -- 1. Acquire transaction-level advisory lock on the hashed key
    -- Guarantees strict serialization across concurrent requests even if the row does not exist yet
    PERFORM pg_advisory_xact_lock(hashtext(p_key));

    -- 2. Ensure row exists so subsequent row-level lock (FOR UPDATE) is unconditionally guaranteed
    INSERT INTO public.settings (key, value, updated_at)
    VALUES (p_key, '{"attempts":[]}'::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO NOTHING;

    -- 3. Acquire exclusive row-level lock on the rate limit key
    SELECT value INTO v_val
    FROM public.settings
    WHERE key = p_key
    FOR UPDATE;

    v_pruned := ARRAY[]::NUMERIC[];

    IF v_val IS NOT NULL AND (v_val ? 'attempts') THEN
        FOR v_ts IN SELECT jsonb_array_elements_text(v_val->'attempts')::NUMERIC LOOP
            IF (p_now_ts - v_ts) < p_window_seconds THEN
                v_pruned := array_append(v_pruned, v_ts);
            END IF;
        END LOOP;
    END IF;

    v_count := cardinality(v_pruned);

    IF v_count >= p_max_attempts THEN
        v_oldest := v_pruned[1];
        v_retry_after := GREATEST(1, ceil(p_window_seconds - (p_now_ts - v_oldest))::INT);
        RETURN jsonb_build_object(
            'allowed', false,
            'count', v_count,
            'retry_after', v_retry_after
        );
    END IF;

    -- Append current timestamp to pruned attempts
    v_pruned := array_append(v_pruned, p_now_ts);

    UPDATE public.settings
    SET value = jsonb_build_object('attempts', to_jsonb(v_pruned), 'updated_at', p_now_ts),
        updated_at = CURRENT_TIMESTAMP
    WHERE key = p_key;

    RETURN jsonb_build_object(
        'allowed', true,
        'count', cardinality(v_pruned),
        'retry_after', 0
    );
END;
$$;

-- 2. Revoke execute privileges from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM authenticated;

-- 3. Grant execute strictly to service_role
GRANT EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) TO service_role;

COMMENT ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) IS 
'Security-hardened atomic rate limiter. Restricted exclusively to service_role with immutable search_path.';
