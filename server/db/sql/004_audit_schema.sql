BEGIN;

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "citext";

-- Create audit schema
CREATE SCHEMA IF NOT EXISTS audit;

-- Generic audit table structure
-- Each audit table will have:
-- - All columns from the original table (with same types)
-- - audit_id: unique identifier for the audit record
-- - audit_operation: INSERT, UPDATE, or DELETE
-- - audit_timestamp: when the change occurred
-- - audit_user_id: who made the change (if available)
-- - audit_old_values: JSONB snapshot of old values (for UPDATE/DELETE)
-- - audit_new_values: JSONB snapshot of new values (for INSERT/UPDATE)

-- Audit table for users
CREATE TABLE IF NOT EXISTS audit.users_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  id UUID,
  email CITEXT,
  password_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  is_active BOOLEAN,
  last_login_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_audit_id ON audit.users_audit(id);
CREATE INDEX IF NOT EXISTS idx_users_audit_timestamp ON audit.users_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_users_audit_operation ON audit.users_audit(audit_operation);

-- Audit table for roles
CREATE TABLE IF NOT EXISTS audit.roles_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  id UUID,
  name TEXT,
  description TEXT,
  is_system BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_roles_audit_id ON audit.roles_audit(id);
CREATE INDEX IF NOT EXISTS idx_roles_audit_timestamp ON audit.roles_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_roles_audit_operation ON audit.roles_audit(audit_operation);

-- Audit table for permissions
CREATE TABLE IF NOT EXISTS audit.permissions_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  id UUID,
  key TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_permissions_audit_id ON audit.permissions_audit(id);
CREATE INDEX IF NOT EXISTS idx_permissions_audit_timestamp ON audit.permissions_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_permissions_audit_operation ON audit.permissions_audit(audit_operation);

-- Audit table for user_roles
CREATE TABLE IF NOT EXISTS audit.user_roles_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  user_id UUID,
  role_id UUID,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_roles_audit_user_id ON audit.user_roles_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_audit_role_id ON audit.user_roles_audit(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_audit_timestamp ON audit.user_roles_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_audit_operation ON audit.user_roles_audit(audit_operation);

-- Audit table for role_permissions
CREATE TABLE IF NOT EXISTS audit.role_permissions_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  role_id UUID,
  permission_id UUID,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_audit_role_id ON audit.role_permissions_audit(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_audit_permission_id ON audit.role_permissions_audit(permission_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_audit_timestamp ON audit.role_permissions_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_role_permissions_audit_operation ON audit.role_permissions_audit(audit_operation);

-- Audit table for sessions
CREATE TABLE IF NOT EXISTS audit.sessions_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  id UUID,
  user_id UUID,
  session_token TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_audit_id ON audit.sessions_audit(id);
CREATE INDEX IF NOT EXISTS idx_sessions_audit_user_id ON audit.sessions_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_audit_timestamp ON audit.sessions_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_audit_operation ON audit.sessions_audit(audit_operation);

-- Audit table for password_resets
CREATE TABLE IF NOT EXISTS audit.password_resets_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  id UUID,
  user_id UUID,
  reset_token TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_resets_audit_id ON audit.password_resets_audit(id);
CREATE INDEX IF NOT EXISTS idx_password_resets_audit_user_id ON audit.password_resets_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_audit_timestamp ON audit.password_resets_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_password_resets_audit_operation ON audit.password_resets_audit(audit_operation);

-- Audit table for auth_providers
CREATE TABLE IF NOT EXISTS audit.auth_providers_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  id UUID,
  user_id UUID,
  provider TEXT,
  provider_user_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_providers_audit_id ON audit.auth_providers_audit(id);
CREATE INDEX IF NOT EXISTS idx_auth_providers_audit_user_id ON audit.auth_providers_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_providers_audit_timestamp ON audit.auth_providers_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_auth_providers_audit_operation ON audit.auth_providers_audit(audit_operation);

-- Audit table for quotes
CREATE TABLE IF NOT EXISTS audit.quotes_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  id TEXT,
  status TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  quote_total NUMERIC(12, 2),
  quote_linehaul NUMERIC(12, 2),
  quote_rate_per_mile NUMERIC(10, 4),
  quote_truck_type TEXT,
  quote_transit_time INTEGER,
  quote_rate_calculation_id TEXT,
  quote_accessorials JSONB,
  quote_accessorials_total NUMERIC(12, 2),
  shipment_data JSONB,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID,
  quote_url TEXT,
  n8n_webhook_sent BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_quotes_audit_id ON audit.quotes_audit(id);
CREATE INDEX IF NOT EXISTS idx_quotes_audit_timestamp ON audit.quotes_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_audit_operation ON audit.quotes_audit(audit_operation);
CREATE INDEX IF NOT EXISTS idx_quotes_audit_status ON audit.quotes_audit(status);

-- Audit table for loads (if it exists in public schema)
CREATE TABLE IF NOT EXISTS audit.loads_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL CHECK (audit_operation IN ('INSERT', 'UPDATE', 'DELETE')),
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  -- Original table columns
  id BIGINT,
  customer TEXT,
  load_number TEXT,
  bill_to TEXT,
  dispatcher TEXT,
  status TEXT,
  type TEXT,
  rate NUMERIC(12,2),
  currency VARCHAR(3),
  carrier_or_driver TEXT,
  equipment_type TEXT,
  shipper TEXT,
  shipper_location TEXT,
  ship_date DATE,
  show_ship_time BOOLEAN,
  description TEXT,
  qty INTEGER,
  weight NUMERIC(12,2),
  value NUMERIC(12,2),
  consignee TEXT,
  consignee_location TEXT,
  delivery_date DATE,
  show_delivery_time BOOLEAN,
  delivery_notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loads_audit_id ON audit.loads_audit(id);
CREATE INDEX IF NOT EXISTS idx_loads_audit_load_number ON audit.loads_audit(load_number);
CREATE INDEX IF NOT EXISTS idx_loads_audit_timestamp ON audit.loads_audit(audit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_loads_audit_operation ON audit.loads_audit(audit_operation);

COMMIT;

