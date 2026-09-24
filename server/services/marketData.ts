import https from 'https';
import db from '../db';

/**
 * External market signals. Today: weekly U.S. retail diesel from the EIA
 * (free API). Stored by week so any past quote can be compared against the
 * fuel price at the time it was made.
 */

export const DIESEL_SERIES = 'EMD_EPD2D_PTE_NUS_DPG';
const EIA_HOST = 'api.eia.gov';
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const WEEKS_TO_FETCH = 52;

let refreshTimer: NodeJS.Timeout | null = null;

export interface DieselPoint {
  period: string;
  value: number;
}

function getJson(path: string): Promise<any> {
  return new Promise(function(resolve, reject) {
    const request = https.request({ method: 'GET', hostname: EIA_HOST, path, timeout: 20000 }, function(response) {
      let raw = '';
      response.on('data', function(chunk) { raw += chunk; });
      response.on('end', function() {
        try {
          const parsed = JSON.parse(raw);
          if ((response.statusCode || 500) >= 400 || parsed.error) {
            reject(new Error(`EIA returned HTTP ${response.statusCode}: ${JSON.stringify(parsed.error || parsed).slice(0, 200)}`));
            return;
          }
          resolve(parsed);
        } catch (_err) {
          reject(new Error(`EIA returned an unreadable response (HTTP ${response.statusCode})`));
        }
      });
    });
    request.on('timeout', function() { request.destroy(new Error('EIA did not respond within 20s.')); });
    request.on('error', reject);
    request.end();
  });
}

/** Fetch the last year of weekly diesel prices and store any new weeks. */
export async function refreshDieselPrices(): Promise<{ stored: number; latest: DieselPoint | null }> {
  const apiKey = String(process.env.EIA_API_KEY || '').trim();
  if (!apiKey) throw new Error('EIA_API_KEY is not set on the server.');
  const query = [
    `api_key=${encodeURIComponent(apiKey)}`,
    'frequency=weekly',
    'data[0]=value',
    `facets[series][]=${DIESEL_SERIES}`,
    'sort[0][column]=period',
    'sort[0][direction]=desc',
    `length=${WEEKS_TO_FETCH}`
  ].join('&');
  const body = await getJson(`/v2/petroleum/pri/gnd/data/?${query}`);
  const rows: DieselPoint[] = ((body.response && body.response.data) || [])
    .map(function(row: any) { return { period: String(row.period), value: Number(row.value) }; })
    .filter(function(row: DieselPoint) { return /^\d{4}-\d{2}-\d{2}$/.test(row.period) && row.value > 0; });
  if (rows.length) {
    await db.query(
      `INSERT INTO public.market_indicators (series, period, value, source)
       SELECT $1, period::date, value, 'EIA'
       FROM UNNEST($2::text[], $3::numeric[]) AS t(period, value)
       ON CONFLICT (series, period) DO UPDATE SET value = EXCLUDED.value, fetched_at = NOW()`,
      [DIESEL_SERIES, rows.map(function(row) { return row.period; }), rows.map(function(row) { return row.value; })]
    );
  }
  return { stored: rows.length, latest: rows[0] || null };
}

/** Diesel for the week on or before `date` (defaults to the latest week). */
export async function dieselOn(date?: string | Date | null): Promise<DieselPoint | null> {
  try {
    const result = await db.query(
      `SELECT period, value FROM public.market_indicators
       WHERE series = $1 AND period <= COALESCE($2::date, CURRENT_DATE)
       ORDER BY period DESC LIMIT 1`,
      [DIESEL_SERIES, date ? new Date(date).toISOString().slice(0, 10) : null]
    );
    if (!result.rows.length) return null;
    return {
      period: new Date(result.rows[0].period).toISOString().slice(0, 10),
      value: Number(result.rows[0].value)
    };
  } catch (_err) {
    return null;
  }
}

export async function recentDiesel(weeks: number): Promise<DieselPoint[]> {
  try {
    const result = await db.query(
      `SELECT period, value FROM public.market_indicators
       WHERE series = $1 ORDER BY period DESC LIMIT $2`,
      [DIESEL_SERIES, weeks]
    );
    return result.rows.map(function(row: any) {
      return { period: new Date(row.period).toISOString().slice(0, 10), value: Number(row.value) };
    });
  } catch (_err) {
    return [];
  }
}

/** Keep diesel current in the background; EIA publishes weekly on Mondays. */
export function startMarketDataRefresh(): void {
  if (refreshTimer || process.env.MARKET_DATA_ENABLED === 'false') return;
  if (!String(process.env.EIA_API_KEY || '').trim()) {
    console.log('[MarketData] EIA_API_KEY not set; diesel fuel adjustments are paused.');
    return;
  }
  const run = function() {
    refreshDieselPrices()
      .then(function(result) {
        if (result.latest) console.log(`[MarketData] Diesel ${result.latest.period}: $${result.latest.value}/gal`);
      })
      .catch(function(err) { console.error('[MarketData]', err && err.message ? err.message : err); });
  };
  run();
  refreshTimer = setInterval(run, REFRESH_INTERVAL_MS);
}
