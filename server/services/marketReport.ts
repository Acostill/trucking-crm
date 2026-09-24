import db from '../db';
import {
  calibrationSamples,
  ExpediteRateRule,
  listExpediteRateRules
} from './expediteRateTable';
import { recentDiesel } from './marketData';

/**
 * "What changed" for the pricing desk: fuel, how the rate table compares with
 * live ExpediteAll prices, and DAT lane moves. Rate changes are suggestions
 * that an admin applies; fuel is adjusted automatically on every quote.
 */

const CALIBRATION_MIN_SAMPLES = 3;
const CALIBRATION_TRIGGER = 0.05;     // suggest when the table is 5%+ off
const CALIBRATION_MAX_STEP = 0.15;    // never move rates more than 15% at once
const DAT_LOOKBACK_DAYS = 60;

function round(value: number, places = 2): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

function median(values: number[]): number {
  const sorted = values.slice().sort(function(a, b) { return a - b; });
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface RateSuggestion {
  vehicleType: string;
  samples: number;
  tableVsExpediteAllPct: number;
  current: { baseCharge: number; ratePerMile: number; minimumCharge: number };
  suggested: { baseCharge: number; ratePerMile: number; minimumCharge: number };
  reason: string;
}

async function suggestionFor(rule: ExpediteRateRule): Promise<{ samples: number; gapPct: number | null; suggestion: RateSuggestion | null }> {
  const samples = await calibrationSamples(rule);
  if (!samples.length) return { samples: 0, gapPct: null, suggestion: null };
  const ratio = median(samples.map(function(sample) { return sample.ratio; }));
  // Positive gap: the table is priced above ExpediteAll.
  const gapPct = round((1 / ratio - 1) * 100, 1);
  if (samples.length < CALIBRATION_MIN_SAMPLES || Math.abs(ratio - 1) < CALIBRATION_TRIGGER) {
    return { samples: samples.length, gapPct, suggestion: null };
  }
  const step = Math.min(1 + CALIBRATION_MAX_STEP, Math.max(1 - CALIBRATION_MAX_STEP, ratio));
  const current = { baseCharge: rule.baseCharge, ratePerMile: rule.ratePerMile, minimumCharge: rule.minimumCharge };
  const suggested = {
    baseCharge: round(rule.baseCharge * step, 0),
    ratePerMile: round(rule.ratePerMile * step, 2),
    minimumCharge: round(rule.minimumCharge * step, 0)
  };
  return {
    samples: samples.length,
    gapPct,
    suggestion: {
      vehicleType: rule.vehicleType,
      samples: samples.length,
      tableVsExpediteAllPct: gapPct,
      current,
      suggested,
      reason: `Across ${samples.length} ExpediteAll prices in the last 120 days the table is ${Math.abs(gapPct)}% ${gapPct > 0 ? 'above' : 'below'} ExpediteAll (fuel-adjusted). ${step !== ratio ? 'Change capped at 15% per update.' : ''}`.trim()
    }
  };
}

export async function buildMarketReport(): Promise<any> {
  const [diesel, rules, datLanes, changes] = await Promise.all([
    recentDiesel(8),
    listExpediteRateRules().catch(function() { return [] as ExpediteRateRule[]; }),
    db.query(
      `WITH spot AS (
         SELECT LEFT(origin_zip, 3) AS o3, LEFT(destination_zip, 3) AS d3, truck_type,
                origin_city || ', ' || origin_state AS origin,
                destination_city || ', ' || destination_state AS destination,
                total_usd, observed_at,
                ROW_NUMBER() OVER (PARTITION BY LEFT(origin_zip, 3), LEFT(destination_zip, 3), truck_type ORDER BY observed_at DESC) AS newest,
                ROW_NUMBER() OVER (PARTITION BY LEFT(origin_zip, 3), LEFT(destination_zip, 3), truck_type ORDER BY observed_at ASC) AS oldest
         FROM public.lane_rate_history
         WHERE source = 'datSpot' AND observation_type = 'market_rate' AND total_usd > 0
           AND observed_at > NOW() - ($1::text || ' days')::interval
       )
       SELECT a.origin, a.destination, a.truck_type,
              a.total_usd AS latest, a.observed_at AS latest_at,
              b.total_usd AS earliest, b.observed_at AS earliest_at
       FROM spot a
       JOIN spot b ON a.o3 = b.o3 AND a.d3 = b.d3 AND a.truck_type IS NOT DISTINCT FROM b.truck_type
       WHERE a.newest = 1 AND b.oldest = 1 AND a.observed_at - b.observed_at >= INTERVAL '7 days'
       ORDER BY ABS(a.total_usd - b.total_usd) / b.total_usd DESC
       LIMIT 15`,
      [String(DAT_LOOKBACK_DAYS)]
    ).catch(function() { return { rows: [] }; }),
    db.query(
      `SELECT c.vehicle_type, c.previous_values, c.new_values, c.reason, c.changed_at,
              COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), u.email) AS changed_by
       FROM public.rate_rule_changes c
       LEFT JOIN public.users u ON u.id = c.changed_by
       ORDER BY c.changed_at DESC LIMIT 10`
    ).catch(function() { return { rows: [] }; })
  ]);

  const latest = diesel[0] || null;
  const weekAgo = diesel[1] || null;
  const monthAgo = diesel[4] || diesel[diesel.length - 1] || null;
  const pct = function(now: any, then: any) { return now && then ? round((now.value / then.value - 1) * 100, 1) : null; };

  const vehicles = [];
  const suggestions: RateSuggestion[] = [];
  for (const rule of rules.filter(function(r) { return r.isActive; })) {
    const calibration = await suggestionFor(rule);
    if (calibration.suggestion) suggestions.push(calibration.suggestion);
    vehicles.push({
      vehicleType: rule.vehicleType,
      baseCharge: rule.baseCharge,
      ratePerMile: rule.ratePerMile,
      minimumCharge: rule.minimumCharge,
      fuelBaselineDiesel: rule.fuelBaselineDiesel,
      fuelPerMileNow: latest && rule.fuelBaselineDiesel != null
        ? round((latest.value - rule.fuelBaselineDiesel) / rule.milesPerGallon, 3)
        : null,
      expediteAllSamples: calibration.samples,
      tableVsExpediteAllPct: calibration.gapPct
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    diesel: {
      latest,
      weekChangePct: pct(latest, weekAgo),
      monthChangePct: pct(latest, monthAgo),
      history: diesel
    },
    vehicles,
    suggestions,
    datLanes: datLanes.rows.map(function(row: any) {
      return {
        lane: `${row.origin || '?'} → ${row.destination || '?'}`,
        truckType: row.truck_type,
        latest: Number(row.latest),
        latestAt: row.latest_at,
        earliest: Number(row.earliest),
        earliestAt: row.earliest_at,
        changePct: round((Number(row.latest) / Number(row.earliest) - 1) * 100, 1)
      };
    }),
    recentChanges: changes.rows
  };
}

export async function recordRateChange(
  client: any,
  vehicleType: string,
  previousValues: any,
  newValues: any,
  reason: string,
  userId: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO public.rate_rule_changes (vehicle_type, previous_values, new_values, reason, changed_by)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)`,
    [vehicleType, previousValues ? JSON.stringify(previousValues) : null, JSON.stringify(newValues), reason, userId]
  );
}

/** Apply the current calibration suggestion (recomputed, never trusted from the client). */
export async function applyRateSuggestion(vehicleType: string, userId: string | null): Promise<RateSuggestion> {
  const rule = (await listExpediteRateRules()).find(function(r) { return r.vehicleType === vehicleType; });
  if (!rule) {
    const err: any = new Error('No rate is set for this vehicle');
    err.status = 404;
    throw err;
  }
  const { suggestion } = await suggestionFor(rule);
  if (!suggestion) {
    const err: any = new Error('There is no rate change to apply for this vehicle right now');
    err.status = 409;
    throw err;
  }
  await db.transactionWithUser(async function(client) {
    await client.query(
      `UPDATE public.expedite_rate_rules
       SET base_charge = $2, rate_per_mile = $3, minimum_charge = $4, updated_by = $5
       WHERE vehicle_type = $1`,
      [vehicleType, suggestion.suggested.baseCharge, suggestion.suggested.ratePerMile, suggestion.suggested.minimumCharge, userId]
    );
    await recordRateChange(client, vehicleType, suggestion.current, suggestion.suggested, suggestion.reason, userId);
  }, userId);
  return suggestion;
}
