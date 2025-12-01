BEGIN;

-- Queue of loads (one active queue entry per load)
CREATE TABLE IF NOT EXISTS public.load_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Reference loads table via its unique load_number
  load_number TEXT NOT NULL REFERENCES public.loads(load_number) ON DELETE CASCADE,

  -- Queue state
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_progress','completed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 0, -- higher = earlier within same day
  delivery_date DATE NOT NULL,         -- denormalized for fast ordering/filtering
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure at most one active queue item per load_number
-- (allows historical records if you ever move items to completed/cancelled)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_load_queue_active_per_load
  ON public.load_queue(load_number)
  WHERE status IN ('queued','in_progress');

-- Fast listing of upcoming active items by delivery date then priority
CREATE INDEX IF NOT EXISTS idx_load_queue_active_by_delivery
  ON public.load_queue(delivery_date ASC, priority DESC, created_at ASC)
  WHERE status IN ('queued','in_progress');

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS trg_load_queue_updated_at ON public.load_queue;
CREATE TRIGGER trg_load_queue_updated_at
BEFORE UPDATE ON public.load_queue
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

COMMIT;


