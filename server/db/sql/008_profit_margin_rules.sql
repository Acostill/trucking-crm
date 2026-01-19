-- Table for admin-defined default profit margins to apply to future loads
CREATE TABLE IF NOT EXISTS public.profit_margin_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  margin_pct NUMERIC(5,2),
  margin_amount NUMERIC(12,2),
  applies_to TEXT DEFAULT 'all', -- e.g., all, customer, equipment_type, service_type
  customer TEXT,
  equipment_type TEXT,
  service_type TEXT,
  effective_start TIMESTAMPTZ,
  effective_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profit_margin_rules
  ADD CONSTRAINT IF NOT EXISTS profit_margin_rules_margin_pct_check
  CHECK (margin_pct IS NULL OR (margin_pct >= 0 AND margin_pct <= 100));

CREATE INDEX IF NOT EXISTS profit_margin_rules_active_idx
  ON public.profit_margin_rules (is_active);

CREATE INDEX IF NOT EXISTS profit_margin_rules_effective_idx
  ON public.profit_margin_rules (effective_start, effective_end);

-- Matching audit table to support audit triggers
CREATE TABLE IF NOT EXISTS audit.profit_margin_rules_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  audit_operation TEXT NOT NULL,
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_user_id UUID,
  audit_old_values JSONB,
  audit_new_values JSONB,
  id BIGINT,
  name TEXT,
  is_active BOOLEAN,
  margin_pct NUMERIC(5,2),
  margin_amount NUMERIC(12,2),
  applies_to TEXT,
  customer TEXT,
  equipment_type TEXT,
  service_type TEXT,
  effective_start TIMESTAMPTZ,
  effective_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
