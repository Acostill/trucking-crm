BEGIN;

CREATE INDEX IF NOT EXISTS idx_email_quote_requests_thread
  ON public.email_quote_requests (external_thread_id);

COMMIT;
