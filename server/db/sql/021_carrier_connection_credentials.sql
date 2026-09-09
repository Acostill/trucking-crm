BEGIN;

CREATE TABLE IF NOT EXISTS public.carrier_connection_credentials (
  provider TEXT PRIMARY KEY CHECK (provider IN ('forward_air')),
  encrypted_payload TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
