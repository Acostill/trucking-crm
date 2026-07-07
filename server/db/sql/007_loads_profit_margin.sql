-- Add profit margin fields to loads and audit logs so admins can adjust per load
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS profit_margin_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS profit_margin_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS profit_margin_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profit_margin_updated_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_profit_margin_pct_check') THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT loads_profit_margin_pct_check
      CHECK (profit_margin_pct IS NULL OR (profit_margin_pct >= 0 AND profit_margin_pct <= 100));
  END IF;
END $$;

ALTER TABLE audit.loads_audit
  ADD COLUMN IF NOT EXISTS profit_margin_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS profit_margin_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS profit_margin_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profit_margin_updated_by UUID;
