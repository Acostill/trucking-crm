BEGIN;

-- This marker is written by the migration runner from DATABASE_ENVIRONMENT.
-- Once set, it cannot be silently relabeled by a later application deploy.
CREATE TABLE IF NOT EXISTS public.application_environment (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  labeled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public quote links use a bearer token whose SHA-256 hash is stored here.
-- The raw token is returned once and is never written to the database.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS public_access_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE audit.quotes_audit
  ADD COLUMN IF NOT EXISTS public_access_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- One approved quote can create exactly one load. This unique relationship is
-- also what makes repeated customer/staff approval requests idempotent.
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS source_quote_id TEXT REFERENCES public.quotes(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loads_source_quote_unique
  ON public.loads (source_quote_id)
  WHERE source_quote_id IS NOT NULL;

ALTER TABLE audit.loads_audit
  ADD COLUMN IF NOT EXISTS source_quote_id TEXT;

-- Load permissions are separate from quote permissions so viewers remain
-- read-only and operational writes are enforced by the API.
INSERT INTO public.permissions (key, description)
VALUES
  ('loads.read', 'Read shipment and load records'),
  ('loads.create', 'Create shipment and load records'),
  ('loads.manage', 'Update shipment and load records')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE
  (r.name = 'admin' AND p.key IN ('loads.read', 'loads.create', 'loads.manage')) OR
  (r.name = 'manager' AND p.key IN ('loads.read', 'loads.create', 'loads.manage')) OR
  (r.name = 'agent' AND p.key IN ('loads.read', 'loads.create', 'loads.manage')) OR
  (r.name = 'quote_approver' AND p.key IN ('loads.read', 'loads.create', 'loads.manage')) OR
  (r.name = 'viewer' AND p.key = 'loads.read')
ON CONFLICT DO NOTHING;

-- The DAT queue worker touches this row on every successful queue poll. The
-- CRM can therefore distinguish an enabled worker from a live worker.
CREATE TABLE IF NOT EXISTS public.dat_worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_successful_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_job_at TIMESTAMPTZ,
  active_job_id TEXT,
  last_error_category TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dat_worker_heartbeats_last_seen
  ON public.dat_worker_heartbeats (last_seen_at DESC);

COMMIT;
