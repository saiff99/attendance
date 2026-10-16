-- ==============================================================================
-- ⚙️ Supabase Migration 05: Create settings Table
-- Shared persistent storage for rate-limiting, system tunnel URLs, and configs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
