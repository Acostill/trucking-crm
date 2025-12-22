BEGIN;

-- Quotes table: stores freight quotes with all relevant details
CREATE TABLE IF NOT EXISTS public.quotes (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Quote details
  quote_total NUMERIC(12, 2),
  quote_linehaul NUMERIC(12, 2),
  quote_rate_per_mile NUMERIC(10, 4),
  quote_truck_type TEXT,
  quote_transit_time INTEGER,
  quote_rate_calculation_id TEXT,
  quote_accessorials JSONB, -- Array of accessorial objects
  quote_accessorials_total NUMERIC(12, 2),
  
  -- Shipment details (stored as JSONB for flexibility)
  shipment_data JSONB,
  
  -- Quote metadata
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Approval/Rejection tracking
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Additional metadata
  quote_url TEXT,
  n8n_webhook_sent BOOLEAN DEFAULT FALSE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_contact_email ON public.quotes(contact_email);
CREATE INDEX IF NOT EXISTS idx_quotes_submitted_at ON public.quotes(submitted_at DESC);

-- GIN index for JSONB queries on shipment_data
CREATE INDEX IF NOT EXISTS idx_quotes_shipment_data ON public.quotes USING GIN (shipment_data);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trg_quotes_updated_at ON public.quotes;
CREATE TRIGGER trg_quotes_updated_at
BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

COMMIT;

