BEGIN;

CREATE TABLE IF NOT EXISTS public.email_quote_advisor_exchanges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_quote_request_id TEXT NOT NULL
    REFERENCES public.email_quote_requests(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  used_web_search BOOLEAN NOT NULL DEFAULT FALSE,
  model TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_quote_advisor_question_length CHECK (char_length(question) BETWEEN 1 AND 2000),
  CONSTRAINT email_quote_advisor_answer_length CHECK (char_length(answer) BETWEEN 1 AND 20000)
);

CREATE INDEX IF NOT EXISTS idx_email_quote_advisor_exchange_quote
  ON public.email_quote_advisor_exchanges (email_quote_request_id, created_at ASC);

COMMIT;
