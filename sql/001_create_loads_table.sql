-- Creates a table to store the "New Active Load" modal data.
-- Postgres-flavored SQL; compatible with most SQL engines with minor adjustments.

CREATE TABLE IF NOT EXISTS loads (
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

-- Optional helpful indexes (keep after creation for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_loads_customer'
  ) THEN
    CREATE INDEX idx_loads_customer ON loads (customer);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_loads_ship_date'
  ) THEN
    CREATE INDEX idx_loads_ship_date ON loads (ship_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_loads_delivery_date'
  ) THEN
    CREATE INDEX idx_loads_delivery_date ON loads (delivery_date);
  END IF;
END $$;


