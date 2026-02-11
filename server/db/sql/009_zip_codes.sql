CREATE TABLE IF NOT EXISTS public.zip_codes (
  zip TEXT NOT NULL,
  state TEXT,
  city TEXT,
  county NULL,
  country TEXT NOT NULL DEFAULT 'US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT zip_codes_pk PRIMARY KEY (zip, city)
);

DROP TRIGGER IF EXISTS trg_zip_codes_updated_at ON public.zip_codes;
CREATE TRIGGER trg_zip_codes_updated_at
BEFORE UPDATE ON public.zip_codes
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
