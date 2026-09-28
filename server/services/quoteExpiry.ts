import db from '../db';

/**
 * Sent quotes that pass their valid-through date with no answer are marked
 * lost automatically, so staff only ever record wins (by booking the load).
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;

export async function expireUnansweredQuotes(): Promise<number> {
  const result = await db.query(
    `WITH expired AS (
       UPDATE public.email_quote_requests
       SET quote_outcome = 'lost',
           outcome_at = NOW(),
           outcome_notes = COALESCE(outcome_notes, 'Expired with no reply (marked automatically)'),
           updated_at = NOW()
       WHERE quote_outcome = 'open'
         AND archived_at IS NULL
         AND quote_sent_at IS NOT NULL
         AND quote_valid_until IS NOT NULL
         AND quote_valid_until < CURRENT_DATE
       RETURNING quote_id
     )
     UPDATE public.quotes q
     SET status = 'rejected', rejected_at = COALESCE(q.rejected_at, NOW()), updated_at = NOW()
     FROM expired
     WHERE q.id = expired.quote_id AND q.status = 'pending'
     RETURNING q.id`
  );
  return result.rowCount || 0;
}

export function startQuoteExpiry(): void {
  if (timer || process.env.QUOTE_EXPIRY_ENABLED === 'false') return;
  const run = function() {
    expireUnansweredQuotes()
      .then(function(count) { if (count) console.log(`[QuoteExpiry] Marked ${count} expired quote(s) lost`); })
      .catch(function(err) { console.error('[QuoteExpiry]', err && err.message ? err.message : err); });
  };
  run();
  timer = setInterval(run, CHECK_INTERVAL_MS);
}
