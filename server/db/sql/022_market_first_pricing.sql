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

-- Price = MAX(minimum, base + per-mile x miles), then a fuel adjustment for
-- diesel moves since the rates were set, then a learned lane correction.
ALTER TABLE public.expedite_rate_rules
  ADD COLUMN IF NOT EXISTS base_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Weekly U.S. diesel ($/gal) when these rates were set.
  ADD COLUMN IF NOT EXISTS fuel_baseline_diesel NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS miles_per_gallon NUMERIC(5,1),
  -- Reefer loads without their own row use the dry rate plus this surcharge.
  ADD COLUMN IF NOT EXISTS reefer_surcharge_pct NUMERIC(5,2) NOT NULL DEFAULT 20;

-- External market series (weekly diesel from EIA; room for SONAR later).
CREATE TABLE IF NOT EXISTS public.market_indicators (
  series TEXT NOT NULL,
  period DATE NOT NULL,
  value NUMERIC(12,4) NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series, period)
);

-- Every approved rate change, so "what changed and why" is answerable later.
CREATE TABLE IF NOT EXISTS public.rate_rule_changes (
  id BIGSERIAL PRIMARY KEY,
  vehicle_type TEXT NOT NULL,
  previous_values JSONB,
  new_values JSONB NOT NULL,
  reason TEXT NOT NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

ALTER TABLE public.pricing_settings
  -- Never quote a load for less profit than this, whatever the margin %.
  ADD COLUMN IF NOT EXISTS min_margin_amount NUMERIC(10,2) NOT NULL DEFAULT 150,
  -- Added to rate-table and DAT truck costs when pickup is today / tomorrow.
  ADD COLUMN IF NOT EXISTS same_day_premium_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS next_day_premium_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  -- Trial run: staff price as usual; the system's suggestion is recorded
  -- next to theirs so the two can be compared before staff rely on it.
  ADD COLUMN IF NOT EXISTS trial_mode BOOLEAN NOT NULL DEFAULT TRUE;

-- What carriers charge First Class for extras, added to estimated truck
-- costs (live carrier APIs price their own extras).
CREATE TABLE IF NOT EXISTS public.accessorial_charges (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  per_hour BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.accessorial_charges (code, label, amount, per_hour, sort_order) VALUES
  ('LIFTGATE', 'Liftgate (each stop)', 100, FALSE, 1),
  ('RESIDENTIAL', 'Residential pickup or delivery', 100, FALSE, 2),
  ('INSIDE_DELIVERY', 'Inside delivery', 125, FALSE, 3),
  ('LIMITED_ACCESS', 'Limited access (school, military, construction)', 100, FALSE, 4),
  ('HAZMAT', 'Hazmat', 150, FALSE, 5),
  ('AFTER_HOURS', 'After-hours or weekend', 150, FALSE, 6),
  ('APPOINTMENT', 'Appointment / call ahead', 25, FALSE, 7),
  ('DETENTION', 'Detention after 2 free hours', 75, TRUE, 8)
ON CONFLICT (code) DO NOTHING;

-- Carrier pay (buy rate) lives on the load, where the truck is booked. It is
-- mirrored to the source quote and lane history so pricing learns from it.
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS carrier_pay NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS carrier_name TEXT;

-- The loads audit trigger copies every column; its table must match or
-- every load insert and update fails.
ALTER TABLE audit.loads_audit
  ADD COLUMN IF NOT EXISTS carrier_pay NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS carrier_name TEXT;

-- Trial-run comparison: what the system would have charged at pricing time.
ALTER TABLE public.email_quote_requests
  ADD COLUMN IF NOT EXISTS system_suggested_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS system_suggested_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS system_suggested_basis TEXT;

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
