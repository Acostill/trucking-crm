BEGIN;

CREATE TABLE IF NOT EXISTS public.dat_rateview_jobs (
  id TEXT PRIMARY KEY,
  email_quote_request_id TEXT NOT NULL
    REFERENCES public.email_quote_requests(id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input_payload JSONB NOT NULL,
  result_payload JSONB,
  error_category TEXT,
  error_message TEXT,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  worker_id TEXT,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dat_rateview_jobs_status_check CHECK (
    status IN (
      'pending', 'claimed', 'running', 'completed', 'needs_auth',
      'failed', 'uncertain', 'cancelled'
    )
  ),
  CONSTRAINT dat_rateview_jobs_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT dat_rateview_jobs_request_unique UNIQUE (
    email_quote_request_id, request_fingerprint
  )
);

CREATE INDEX IF NOT EXISTS idx_dat_rateview_jobs_pending
  ON public.dat_rateview_jobs (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_dat_rateview_jobs_quote
  ON public.dat_rateview_jobs (email_quote_request_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_dat_rateview_jobs_updated_at ON public.dat_rateview_jobs;
CREATE TRIGGER trg_dat_rateview_jobs_updated_at
BEFORE UPDATE ON public.dat_rateview_jobs
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

COMMIT;
