-- ==============================================================================
-- 🔒 Supabase Migration 15: Atomic Rate Limiting Stored Procedures
-- ==============================================================================
-- Implements an atomic check-and-increment transaction in PostgreSQL
-- using row-level locking (SELECT ... FOR UPDATE) on the settings table.
-- Guarantees zero race conditions across distributed workers without Redis.
-- ==============================================================================

-- 1. Ensure settings table exists with primary key and timestamp
CREATE TABLE IF NOT EXISTS public.settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON public.settings(key);

-- 2. Stored Procedure: atomic_check_rate_limit
-- Atomically checks a sliding-window rate limit and records the new attempt
-- in a single ACID transaction with row-level locking.
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

-- 3. Hardened Security, Function Execution Restrictions & Privilege Lockdown
-- Revoke execution from untrusted client roles (preventing arbitrary key writes in settings)
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) FROM authenticated;

-- Grant execution strictly to the backend server-side service_role
GRANT EXECUTE ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) TO service_role;

COMMENT ON FUNCTION public.atomic_check_rate_limit(TEXT, INT, NUMERIC, NUMERIC) IS 
'Security-hardened atomic sliding-window rate limiter with fixed search_path. Restricted exclusively to service_role.';

