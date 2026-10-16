-- ==============================================================================
-- 📜 Supabase Migration 08: Dedicated Tunnel Security & Settings Configuration
-- Creates dedicated configuration store for backend tunnel discovery,
-- removes dependency on special session rows, and enforces zero-trust RLS.
-- ==============================================================================

-- 1. Ensure settings table exists with primary key and JSONB value store
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Enable Row-Level Security (RLS) on settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Service Role has full read/write access (Server-Side Only)
DROP POLICY IF EXISTS "service_role_full_settings" ON public.settings;
CREATE POLICY "service_role_full_settings" 
ON public.settings 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 4. Transparent Migration: Migrate existing tunnel configuration from sessions row if present
DO $$
DECLARE
    legacy_url TEXT;
    clean_url TEXT;
    sig_val TEXT;
BEGIN
    SELECT instructor_name INTO legacy_url
    FROM public.sessions
    WHERE id = '00000000-0000-0000-0000-000000000000'
    LIMIT 1;

    IF legacy_url IS NOT NULL AND legacy_url LIKE 'http%' THEN
        IF position('#sig=' in legacy_url) > 0 THEN
            clean_url := split_part(legacy_url, '#sig=', 1);
            sig_val := split_part(legacy_url, '#sig=', 2);
        ELSE
            clean_url := legacy_url;
            sig_val := NULL;
        END IF;

        INSERT INTO public.settings (key, value, updated_at)
        VALUES (
            'tunnel_config',
            jsonb_build_object(
                'url', clean_url,
                'signature', sig_val,
                'signed_url', legacy_url,
                'migrated_from', 'sessions_00000000'
            ),
            NOW()
        )
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;
