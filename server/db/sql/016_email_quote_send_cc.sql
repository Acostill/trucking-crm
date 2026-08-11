BEGIN;

ALTER TABLE public.email_quote_requests
  ADD COLUMN IF NOT EXISTS quote_sent_cc TEXT;

COMMIT;
