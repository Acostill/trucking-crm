BEGIN;

-- Market-first pricing: brokers price from the market and their own lane
-- history, then cover the load with a truck after the customer awards it.

-- Expedite buy rates (what First Class expects to pay a driver) by vehicle.
-- Staff maintain these numbers; no defaults are seeded because they are the
-- brokerage's own commercial rates.
CREATE TABLE IF NOT EXISTS public.expedite_rate_rules (
  id BIGSERIAL PRIMARY KEY,
  vehicle_type TEXT NOT NULL,
  rate_per_mile NUMERIC(8,2) NOT NULL,
  minimum_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expedite_rate_rules_vehicle_unique UNIQUE (vehicle_type),
  CONSTRAINT expedite_rate_rules_rate_check CHECK (rate_per_mile > 0),
  CONSTRAINT expedite_rate_rules_minimum_check CHECK (minimum_charge >= 0)
);

DROP TRIGGER IF EXISTS trg_expedite_rate_rules_updated_at ON public.expedite_rate_rules;
CREATE TRIGGER trg_expedite_rate_rules_updated_at
BEFORE UPDATE ON public.expedite_rate_rules
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Brokerage-wide pricing switches (single row).
CREATE TABLE IF NOT EXISTS public.pricing_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  -- Accuracy first: ask ExpediteAll on every cargo-van quote and show it next
  -- to the rate table. Turn off once the table matches what ExpediteAll
  -- charges, so ExpediteAll is only asked after the customer awards a load.
  expedite_all_before_award BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_settings_single_row CHECK (id = 1)
);

INSERT INTO public.pricing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Append-only lane history. Every carrier rate, market rate, customer price,
-- and actual truck cost is kept so pricing can be learned from past loads.
CREATE TABLE IF NOT EXISTS public.lane_rate_history (
  id BIGSERIAL PRIMARY KEY,
  observation_type TEXT NOT NULL,
  source TEXT NOT NULL,
  email_quote_request_id TEXT
    REFERENCES public.email_quote_requests(id) ON DELETE SET NULL,
  origin_zip TEXT,
  origin_city TEXT,
  origin_state TEXT,
  destination_zip TEXT,
  destination_city TEXT,
  destination_state TEXT,
  truck_type TEXT,
  miles NUMERIC(10,1),
  weight_lbs NUMERIC(12,2),
  freight_class TEXT,
  total_usd NUMERIC(12,2),
  rate_per_mile NUMERIC(10,4),
  request_fingerprint TEXT,
  from_cache BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lane_rate_history_type_check CHECK (
    observation_type IN ('carrier_quote', 'market_rate', 'rate_table', 'customer_price', 'truck_cost')
  )
);

CREATE INDEX IF NOT EXISTS idx_lane_rate_history_fingerprint
  ON public.lane_rate_history (source, request_fingerprint, observed_at DESC)
  WHERE request_fingerprint IS NOT NULL AND from_cache = FALSE;

CREATE INDEX IF NOT EXISTS idx_lane_rate_history_lane
  ON public.lane_rate_history (LEFT(origin_zip, 3), LEFT(destination_zip, 3), truck_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lane_rate_history_quote
  ON public.lane_rate_history (email_quote_request_id);

-- ZIP centroids (Census ZCTA gazetteer) for mileage estimates on lanes that
-- have no carrier-reported miles yet. Loaded by seed-zip-centroids.ts.
CREATE TABLE IF NOT EXISTS public.zip_centroids (
  zip TEXT PRIMARY KEY,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL
);

-- What First Class actually paid the truck once an awarded load was covered.
ALTER TABLE public.email_quote_requests
  ADD COLUMN IF NOT EXISTS truck_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS truck_carrier_name TEXT,
  ADD COLUMN IF NOT EXISTS truck_covered_at TIMESTAMPTZ;

COMMIT;
