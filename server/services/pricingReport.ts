import db from '../db';

/**
 * Broker pricing scorecard: win rate, margin actually earned after covering
 * the truck, and how many carrier requests each booking cost.
 */

function num(value: any): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

const MODE_SQL = `CASE
  WHEN REGEXP_REPLACE(COALESCE(shipment_request->>'truckType', ''), '^Reefer ', '') IN ('Cargo Van', 'Box Truck', 'Straight Truck') THEN 'expedite'
  WHEN COALESCE(shipment_request->>'truckType', '') ~* '(dry van|flatbed)' THEN 'truckload'
  ELSE 'unassigned'
END`;

export async function buildPricingReport(days: number): Promise<any> {
  const params = [String(days)];
  const window = `received_at > NOW() - ($1::text || ' days')::interval AND archived_at IS NULL`;

  const [summary, byMode, lanes, carriers, dat] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS quotes,
              COUNT(*) FILTER (WHERE client_price IS NOT NULL)::int AS priced,
              COUNT(*) FILTER (WHERE quote_outcome = 'awarded')::int AS awarded,
              COUNT(*) FILTER (WHERE quote_outcome = 'lost')::int AS lost,
              AVG(margin_pct) FILTER (WHERE client_price IS NOT NULL) AS quoted_margin_pct,
              COUNT(*) FILTER (WHERE truck_cost IS NOT NULL)::int AS covered,
              AVG((client_price - truck_cost) / NULLIF(client_price, 0) * 100)
                FILTER (WHERE truck_cost IS NOT NULL AND client_price IS NOT NULL) AS actual_margin_pct,
              SUM(client_price - truck_cost)
                FILTER (WHERE truck_cost IS NOT NULL AND client_price IS NOT NULL) AS gross_profit
       FROM public.email_quote_requests
       WHERE ${window}`,
      params
    ),
    db.query(
      `SELECT ${MODE_SQL} AS mode,
              COUNT(*)::int AS quotes,
              COUNT(*) FILTER (WHERE quote_outcome = 'awarded')::int AS awarded,
              COUNT(*) FILTER (WHERE quote_outcome IN ('awarded', 'lost'))::int AS decided,
              AVG(margin_pct) FILTER (WHERE client_price IS NOT NULL) AS quoted_margin_pct
       FROM public.email_quote_requests
       WHERE ${window}
       GROUP BY 1
       ORDER BY 2 DESC`,
      params
    ),
    db.query(
      `SELECT UPPER(COALESCE(shipment_request->'pickup'->'location'->>'state', '?')) AS origin_state,
              UPPER(COALESCE(shipment_request->'delivery'->'location'->>'state', '?')) AS destination_state,
              COALESCE(shipment_request->>'truckType', 'Unassigned') AS truck_type,
              COUNT(*)::int AS quotes,
              COUNT(*) FILTER (WHERE quote_outcome = 'awarded')::int AS awarded,
              COUNT(*) FILTER (WHERE quote_outcome IN ('awarded', 'lost'))::int AS decided,
              AVG(client_price) FILTER (WHERE client_price IS NOT NULL) AS avg_quoted,
              AVG(truck_cost) FILTER (WHERE truck_cost IS NOT NULL) AS avg_truck_cost
       FROM public.email_quote_requests
       WHERE ${window}
       GROUP BY 1, 2, 3
       ORDER BY quotes DESC
       LIMIT 25`,
      params
    ),
    db.query(
      `SELECT h.source,
              COUNT(*) FILTER (WHERE h.from_cache = FALSE)::int AS live_requests,
              COUNT(*) FILTER (WHERE h.from_cache = TRUE)::int AS reused_from_history,
              (SELECT COUNT(*)::int FROM public.email_quote_requests q
               WHERE q.selected_carrier_key = h.source AND q.quote_outcome = 'awarded'
                 AND q.received_at > NOW() - ($1::text || ' days')::interval) AS awarded_on_rate
       FROM public.lane_rate_history h
       WHERE h.observation_type = 'carrier_quote'
         AND h.observed_at > NOW() - ($1::text || ' days')::interval
       GROUP BY h.source`,
      params
    ).catch(function() { return { rows: [] }; }),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE input_payload ? 'reusedFromJobId')::int AS reused,
              COUNT(*) FILTER (WHERE NOT (input_payload ? 'reusedFromJobId') AND status = 'completed')::int AS searched
       FROM public.dat_rateview_jobs
       WHERE created_at > NOW() - ($1::text || ' days')::interval
         AND COALESCE(input_payload->>'workflowId', '') = ''`,
      params
    ).catch(function() { return { rows: [{}] }; })
  ]);

  const s = summary.rows[0] || {};
  const decided = Number(s.awarded || 0) + Number(s.lost || 0);
  return {
    days,
    summary: {
      quotes: s.quotes || 0,
      priced: s.priced || 0,
      awarded: s.awarded || 0,
      lost: s.lost || 0,
      winRatePct: decided ? num((Number(s.awarded) / decided) * 100) : null,
      quotedMarginPct: num(s.quoted_margin_pct),
      covered: s.covered || 0,
      actualMarginPct: num(s.actual_margin_pct),
      grossProfit: num(s.gross_profit)
    },
    byMode: byMode.rows.map(function(row: any) {
      return {
        mode: row.mode,
        quotes: row.quotes,
        awarded: row.awarded,
        winRatePct: row.decided ? num((row.awarded / row.decided) * 100) : null,
        quotedMarginPct: num(row.quoted_margin_pct)
      };
    }),
    lanes: lanes.rows.map(function(row: any) {
      return {
        lane: `${row.origin_state} → ${row.destination_state}`,
        truckType: row.truck_type,
        quotes: row.quotes,
        awarded: row.awarded,
        winRatePct: row.decided ? num((row.awarded / row.decided) * 100) : null,
        avgQuoted: num(row.avg_quoted),
        avgTruckCost: num(row.avg_truck_cost)
      };
    }),
    carrierRequests: carriers.rows.map(function(row: any) {
      return {
        source: row.source,
        liveRequests: row.live_requests,
        reusedFromHistory: row.reused_from_history,
        awardedOnRate: row.awarded_on_rate,
        requestsPerBooking: row.awarded_on_rate ? num(row.live_requests / row.awarded_on_rate) : null
      };
    }),
    datRateView: {
      searches: (dat.rows[0] && dat.rows[0].searched) || 0,
      reusedAcrossQuotes: (dat.rows[0] && dat.rows[0].reused) || 0
    }
  };
}
