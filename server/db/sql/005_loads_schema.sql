BEGIN;

-- Loads table: stores shipment/load data from the "New Active Load" modal
CREATE TABLE IF NOT EXISTS public.loads (
  id BIGSERIAL PRIMARY KEY,

  -- Core info
  customer TEXT NOT NULL,
  load_number TEXT NOT NULL,
  bill_to TEXT,
  dispatcher TEXT,
  status TEXT NOT NULL DEFAULT 'Open', -- e.g., Open | Pending | Closed
  type TEXT, -- e.g., Line Haul

  -- Pricing
  rate NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'USD',

  -- Carrier/Equipment
  carrier_or_driver TEXT, -- "Carrier" or "Driver"
  equipment_type TEXT, -- e.g., 53' Dry Van

  -- Shipper
  shipper TEXT,
  shipper_location TEXT,
  ship_date DATE,
  show_ship_time BOOLEAN DEFAULT TRUE,
  description TEXT,
  qty INTEGER,
  weight NUMERIC(12,2),
  value NUMERIC(12,2),

  -- Consignee
  consignee TEXT,
  consignee_location TEXT,
  delivery_date DATE,
  show_delivery_time BOOLEAN DEFAULT TRUE,
  delivery_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT loads_load_number_key UNIQUE (load_number)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_loads_customer ON public.loads(customer);
CREATE INDEX IF NOT EXISTS idx_loads_ship_date ON public.loads(ship_date);
CREATE INDEX IF NOT EXISTS idx_loads_delivery_date ON public.loads(delivery_date);
CREATE INDEX IF NOT EXISTS idx_loads_status ON public.loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_load_number ON public.loads(load_number);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trg_loads_updated_at ON public.loads;
CREATE TRIGGER trg_loads_updated_at
BEFORE UPDATE ON public.loads
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

COMMIT;

