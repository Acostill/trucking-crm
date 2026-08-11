BEGIN;

ALTER TABLE public.email_quote_requests
  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_sent_to TEXT;

ALTER TABLE public.email_quote_requests
  DROP CONSTRAINT IF EXISTS email_quote_requests_status_check;

ALTER TABLE public.email_quote_requests
  ADD CONSTRAINT email_quote_requests_status_check CHECK (
    status IN ('received', 'parsing', 'rating', 'ready', 'needs_review', 'failed', 'priced', 'sent')
  );

COMMIT;
