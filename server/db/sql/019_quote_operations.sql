BEGIN;

ALTER TABLE public.email_quote_requests
  ADD COLUMN IF NOT EXISTS advisor_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS advisor_acknowledged_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_valid_until DATE,
  ADD COLUMN IF NOT EXISTS quote_outcome TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT NOT NULL DEFAULT 'not_needed',
  ADD COLUMN IF NOT EXISTS follow_up_note TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_quote_requests_outcome_check'
  ) THEN
    ALTER TABLE public.email_quote_requests
      ADD CONSTRAINT email_quote_requests_outcome_check
      CHECK (quote_outcome IN ('open', 'awarded', 'lost'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_quote_requests_follow_up_check'
  ) THEN
    ALTER TABLE public.email_quote_requests
      ADD CONSTRAINT email_quote_requests_follow_up_check
      CHECK (follow_up_status IN ('not_needed', 'due', 'completed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_quote_customer_performance
  ON public.email_quote_requests (LOWER(COALESCE(quote_sent_to, sender_email)), quote_outcome)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_quote_follow_up_due
  ON public.email_quote_requests (follow_up_at)
  WHERE archived_at IS NULL AND follow_up_status = 'due';

COMMIT;
