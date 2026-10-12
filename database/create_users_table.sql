-- ==============================================================================
-- 👥 Table: app_users (MedAttend AI - Faculty & Role-Based Access Control)
-- Run this in Supabase Dashboard > SQL Editor to enable dynamic faculty accounts.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'Faculty' CHECK (role IN ('Super Admin', 'Faculty')),
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);

-- Enable Row Level Security (RLS)
ALTER TABLE IF EXISTS app_users ENABLE ROW LEVEL SECURITY;

-- Drop previous policies for idempotence
DROP POLICY IF EXISTS "service_role_unrestricted_app_users" ON app_users;
DROP POLICY IF EXISTS "allow_read_app_users" ON app_users;
DROP POLICY IF EXISTS "allow_insert_app_users" ON app_users;
DROP POLICY IF EXISTS "allow_update_app_users" ON app_users;
DROP POLICY IF EXISTS "allow_delete_app_users" ON app_users;

-- Policies: Strict Zero-Trust (Service Role Only)
-- Prevents attackers from inserting Super Admin accounts or modifying user profiles directly via Supabase API.
CREATE POLICY "service_role_unrestricted_app_users" ON app_users
FOR ALL TO service_role USING (true) WITH CHECK (true);
