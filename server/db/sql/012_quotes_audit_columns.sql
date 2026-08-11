BEGIN;

ALTER TABLE audit.quotes_audit
  ADD COLUMN IF NOT EXISTS source_email_quote_id TEXT,
  ADD COLUMN IF NOT EXISTS carrier_source TEXT,
  ADD COLUMN IF NOT EXISTS carrier_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS margin_pct NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(12, 2);

COMMIT;
