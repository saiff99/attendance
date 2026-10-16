-- ==============================================================================
-- 👥 Supabase Migration 04: Create app_users Table
-- Role-based access control (RBAC) for Super Admin and Faculty accounts
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'Faculty' CHECK (role IN ('Super Admin', 'Faculty')),
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users(role);
