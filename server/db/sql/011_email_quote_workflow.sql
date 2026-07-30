BEGIN;

CREATE TABLE IF NOT EXISTS public.email_quote_requests (
  id TEXT PRIMARY KEY,
  mailbox_address TEXT NOT NULL,
  external_message_id TEXT NOT NULL UNIQUE,
  external_thread_id TEXT,
  internet_message_id TEXT,
  sender_name TEXT,
  sender_email TEXT,
  recipient_email TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ,
  raw_text TEXT NOT NULL,
  parsed_payload JSONB,
  shipment_request JSONB,
  carrier_quotes JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendation JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  processing_error TEXT,
  selected_carrier_key TEXT,
  selected_carrier_source TEXT,
  selected_carrier_cost NUMERIC(12, 2),
  margin_pct NUMERIC(8, 4),
  margin_amount NUMERIC(12, 2),
  client_price NUMERIC(12, 2),
  staff_notes TEXT,
  quote_id TEXT,
  last_rated_at TIMESTAMPTZ,
  priced_at TIMESTAMPTZ,
  priced_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_quote_requests_status_check CHECK (
    status IN ('received', 'parsing', 'rating', 'ready', 'needs_review', 'failed', 'priced')
  ),
  CONSTRAINT email_quote_requests_margin_pct_check CHECK (
    margin_pct IS NULL OR margin_pct >= 0
  ),
  CONSTRAINT email_quote_requests_price_check CHECK (
    client_price IS NULL OR selected_carrier_cost IS NULL OR client_price >= selected_carrier_cost
  )
);

CREATE INDEX IF NOT EXISTS idx_email_quote_requests_status
  ON public.email_quote_requests (status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_quote_requests_created_at
  ON public.email_quote_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_quote_requests_sender
  ON public.email_quote_requests (LOWER(sender_email));

CREATE INDEX IF NOT EXISTS idx_email_quote_requests_shipment
  ON public.email_quote_requests USING GIN (shipment_request);

DROP TRIGGER IF EXISTS trg_email_quote_requests_updated_at ON public.email_quote_requests;
CREATE TRIGGER trg_email_quote_requests_updated_at
BEFORE UPDATE ON public.email_quote_requests
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS source_email_quote_id TEXT
    REFERENCES public.email_quote_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carrier_source TEXT,
  ADD COLUMN IF NOT EXISTS carrier_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS margin_pct NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(12, 2);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_source_email_quote
  ON public.quotes (source_email_quote_id)
  WHERE source_email_quote_id IS NOT NULL;

COMMIT;
