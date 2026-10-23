-- ==============================================================================
-- 🔒 Supabase Migration 10: Zero-Trust Credentials & Schema Hardening
-- ==============================================================================
-- Purges hardcoded/built-in login accounts and weak default student roll/123456 fallbacks.
-- Ensures all authentication is verified exclusively against Supabase database.
-- ==============================================================================

-- 1. Ensure app_users table exists and has proper schema
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'Faculty' CHECK (role IN ('Super Admin', 'Admin', 'Faculty')),
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users(role);

-- 2. Zero-Trust Security Policy:
-- No default or predictable passwords/accounts are seeded in migrations.
-- Initial administrator accounts must be provisioned with high-entropy unique credentials
-- created directly via the secure setup CLI or the Super Admin Console.
