import db from '../db';
import { UnifiedQuoteRequest } from '../types/quote';
import { CarrierQuoteOption } from './carrierQuoteOptions';
import { estimateLaneMiles } from './laneHistory';
import { dieselOn, DieselPoint, recentDiesel } from './marketData';
import { baseTruckType } from './quoteRouting';

/**
 * First Class's own expedite buy rates: what it expects to pay for a van or
 * straight truck. A quote's truck cost is
 *
 *   MAX(minimum, base + per-mile x miles)      the rate table
 *   + miles x (diesel now - diesel when set) / mpg   fuel adjustment
 *   x lane correction                           learned from ExpediteAll
 *
 * The customer price is this cost plus the brokerage margin.
 */

export interface ExpediteRateRule {
  id: number;
  vehicleType: string;
  baseCharge: number;
  ratePerMile: number;
  minimumCharge: number;
  fuelBaselineDiesel: number | null;
  milesPerGallon: number;
  reeferSurchargePct: number;
  // Set when a reefer load is priced from the dry rule plus the surcharge.
  reeferSurchargeApplied?: number;
  isActive: boolean;
  notes: string | null;
  updatedAt: string | null;
}

/** Typical loaded fuel economy when staff have not entered one. */
export const DEFAULT_MPG: Record<string, number> = {
  'Cargo Van': 16,
  'Box Truck': 10,
  'Straight Truck': 8
};

// Lane corrections need at least this many recent ExpediteAll prices and
// never move a price more than 25% either way.
const LANE_MIN_SAMPLES = 2;
const LANE_LOOKBACK_DAYS = 120;
const LANE_FACTOR_LIMITS = [0.75, 1.25];

function rowToRule(row: any): ExpediteRateRule {
  const base = String(row.vehicle_type || '').replace(/^Reefer\s+/i, '');
  return {
    id: Number(row.id),
    vehicleType: row.vehicle_type,
    baseCharge: Number(row.base_charge || 0),
    ratePerMile: Number(row.rate_per_mile),
    minimumCharge: Number(row.minimum_charge),
    fuelBaselineDiesel: row.fuel_baseline_diesel == null ? null : Number(row.fuel_baseline_diesel),
    milesPerGallon: Number(row.miles_per_gallon) > 0 ? Number(row.miles_per_gallon) : (DEFAULT_MPG[base] || 10),
    reeferSurchargePct: row.reefer_surcharge_pct == null ? 20 : Number(row.reefer_surcharge_pct),
    isActive: row.is_active !== false,
    notes: row.notes || null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function listExpediteRateRules(): Promise<ExpediteRateRule[]> {
  const result = await db.query(
    `SELECT * FROM public.expedite_rate_rules ORDER BY vehicle_type ASC`
  );
  return result.rows.map(rowToRule);
}

/** Exact vehicle first (e.g. "Reefer Cargo Van"), then its dry base type. */
export async function findExpediteRateRule(shipment: UnifiedQuoteRequest): Promise<ExpediteRateRule | null> {
  const exact = String(shipment && shipment.truckType || '').trim();
  const base = baseTruckType(shipment);
  if (!exact) return null;
  try {
    const result = await db.query(
      `SELECT * FROM public.expedite_rate_rules
       WHERE is_active = TRUE AND vehicle_type = ANY($1::text[])
       ORDER BY CASE WHEN vehicle_type = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [[exact, base].filter(Boolean), exact]
    );
    if (!result.rows.length) return null;
    const rule = rowToRule(result.rows[0]);
    // A reefer load priced from the dry vehicle's row pays the reefer surcharge.
    if (/^Reefer\s/i.test(exact) && rule.vehicleType !== exact && rule.reeferSurchargePct > 0) {
      const multiplier = 1 + rule.reeferSurchargePct / 100;
      return {
        ...rule,
        baseCharge: rule.baseCharge * multiplier,
        ratePerMile: rule.ratePerMile * multiplier,
        minimumCharge: rule.minimumCharge * multiplier,
        reeferSurchargeApplied: rule.reeferSurchargePct
      };
    }
    return rule;
  } catch (err: any) {
    // Missing migration: behave as if no rate is configured.
    console.error('Expedite rate rule lookup failed:', err && err.message ? err.message : err);
    return null;
  }
}

export function priceFromRule(rule: Pick<ExpediteRateRule, 'baseCharge' | 'ratePerMile' | 'minimumCharge'>, miles: number): number {
  const lineHaul = (rule.baseCharge || 0) + miles * rule.ratePerMile;
  return Number(Math.max(lineHaul, rule.minimumCharge).toFixed(2));
}

export function fuelAdjustment(rule: ExpediteRateRule, miles: number, dieselNow: number | null): number {
  if (rule.fuelBaselineDiesel == null || dieselNow == null || !(rule.milesPerGallon > 0)) return 0;
  return Number(((miles * (dieselNow - rule.fuelBaselineDiesel)) / rule.milesPerGallon).toFixed(2));
}

function dieselAt(series: DieselPoint[], date: string): number | null {
  // series is newest first; take the week on or before the date.
  const day = date.slice(0, 10);
  const point = series.find(function(entry) { return entry.period <= day; });
  return point ? point.value : null;
}

function median(values: number[]): number {
  const sorted = values.slice().sort(function(a, b) { return a - b; });
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface CalibrationSample {
  kind: 'expediteAll' | 'manual' | 'paid';
  lane: string;
  miles: number;
  observedAt: string;
  expediteAllCost: number;
  modelCost: number;
  ratio: number;
}

/**
 * Real prices for this vehicle — what First Class actually paid trucks,
 * prices staff recorded by hand, and live ExpediteAll quotes — compared with
 * what this rule would have priced the same trip at, using that week's diesel.
 * Reefer prices are compared against the reefer-adjusted rule.
 */
export async function calibrationSamples(
  rule: ExpediteRateRule,
  options: { originZip?: string; destinationZip?: string; lookbackDays?: number } = {}
): Promise<CalibrationSample[]> {
  const params: any[] = [rule.vehicleType.replace(/^Reefer\s+/i, ''), String(options.lookbackDays || LANE_LOOKBACK_DAYS)];
  let laneFilter = '';
  if (options.originZip && options.destinationZip) {
    params.push(options.originZip.slice(0, 3), options.destinationZip.slice(0, 3));
    laneFilter = 'AND LEFT(origin_zip, 3) = $3 AND LEFT(destination_zip, 3) = $4';
  }
  try {
    const [rows, series] = await Promise.all([
      db.query(
        `SELECT origin_zip, destination_zip, miles, total_usd, observed_at, truck_type,
                CASE WHEN observation_type = 'truck_cost' THEN 'paid'
                     WHEN source = 'manualQuote' THEN 'manual'
                     ELSE 'expediteAll' END AS kind
         FROM public.lane_rate_history
         WHERE ((observation_type = 'carrier_quote' AND source IN ('expediteAll', 'manualQuote') AND from_cache = FALSE)
                OR observation_type = 'truck_cost')
           AND miles > 0 AND total_usd > 0
           AND LOWER(REGEXP_REPLACE(COALESCE(truck_type, 'Cargo Van'), '^Reefer ', '', 'i')) = LOWER($1)
           ${/^Reefer\s/i.test(rule.vehicleType) ? "AND truck_type ILIKE 'reefer %'" : ''}
           AND observed_at > NOW() - ($2::text || ' days')::interval
           ${laneFilter}`,
        params
      ),
      recentDiesel(80)
    ]);
    // Compare against the dry rule; reefer observations get the surcharge.
    const dryRule = rule.reeferSurchargeApplied
      ? { ...rule, baseCharge: rule.baseCharge / (1 + rule.reeferSurchargeApplied / 100), ratePerMile: rule.ratePerMile / (1 + rule.reeferSurchargeApplied / 100), minimumCharge: rule.minimumCharge / (1 + rule.reeferSurchargeApplied / 100) }
      : rule;
    return rows.rows.map(function(row: any) {
      const miles = Number(row.miles);
      const observedAt = new Date(row.observed_at).toISOString();
      // ExpediteAll's API prices every cargo van the same whether or not it is
      // refrigerated, so only paid and recorded prices count as reefer evidence.
      const reefer = row.kind !== 'expediteAll' &&
        /^reefer\s/i.test(String(row.truck_type || '')) && !/^reefer\s/i.test(rule.vehicleType);
      const multiplier = reefer ? 1 + (rule.reeferSurchargePct || 0) / 100 : 1;
      const modelCost = (priceFromRule(dryRule, miles) + fuelAdjustment(dryRule, miles, dieselAt(series, observedAt))) * multiplier;
      const expediteAllCost = Number(row.total_usd);
      return {
        kind: row.kind,
        lane: `${row.origin_zip || '?'}→${row.destination_zip || '?'}`,
        miles,
        observedAt,
        expediteAllCost,
        modelCost,
        ratio: expediteAllCost / modelCost
      };
    }).filter(function(sample: CalibrationSample) { return Number.isFinite(sample.ratio) && sample.ratio > 0; });
  } catch (err: any) {
    console.error('Rate calibration lookup failed:', err && err.message ? err.message : err);
    return [];
  }
}

export async function laneCorrection(
  rule: ExpediteRateRule,
  shipment: UnifiedQuoteRequest
): Promise<{ factor: number; samples: number } | null> {
  const origin = String(shipment.pickup && shipment.pickup.location && shipment.pickup.location.zip || '');
  const destination = String(shipment.delivery && shipment.delivery.location && shipment.delivery.location.zip || '');
  if (!/^\d{3}/.test(origin) || !/^\d{3}/.test(destination)) return null;
  const samples = await calibrationSamples(rule, { originZip: origin, destinationZip: destination });
  if (samples.length < LANE_MIN_SAMPLES) return null;
  const factor = Math.min(LANE_FACTOR_LIMITS[1], Math.max(LANE_FACTOR_LIMITS[0], median(samples.map(function(s) { return s.ratio; }))));
  return { factor: Number(factor.toFixed(4)), samples: samples.length };
}

export async function buildRateTableOption(
  shipment: UnifiedQuoteRequest,
  rule: ExpediteRateRule
): Promise<CarrierQuoteOption> {
  const mileage = await estimateLaneMiles(shipment);
  if (!mileage) {
    return {
      key: 'rateTable',
      source: 'First Class rate table',
      available: false,
      selectable: false,
      pricingBasis: 'rate_table',
      truckType: shipment.truckType,
      error: 'Lane miles are unknown. Load ZIP centroids (npm run db:seed:zip-centroids) or enter the client price manually.'
    };
  }
  const [diesel, lane] = await Promise.all([dieselOn(), laneCorrection(rule, shipment)]);
  const tableCost = priceFromRule(rule, mileage.miles);
  const fuel = fuelAdjustment(rule, mileage.miles, diesel ? diesel.value : null);
  const beforeLane = tableCost + fuel;
  const cost = Number((beforeLane * (lane ? lane.factor : 1)).toFixed(2));
  const notes: string[] = [];
  if (tableCost === rule.minimumCharge) notes.push('Minimum charge applies.');
  if (fuel) notes.push(`Fuel ${fuel > 0 ? '+' : '−'}$${Math.abs(fuel).toFixed(0)} (diesel $${diesel!.value.toFixed(2)} vs $${rule.fuelBaselineDiesel!.toFixed(2)} when set)`);
  if (rule.reeferSurchargeApplied) notes.push(`Reefer +${rule.reeferSurchargeApplied}%`);
  if (lane) notes.push(`Lane ${lane.factor >= 1 ? '+' : '−'}${Math.abs(Math.round((lane.factor - 1) * 100))}% from ${lane.samples} real prices`);
  return {
    key: 'rateTable',
    source: 'First Class rate table',
    available: true,
    selectable: true,
    benchmark: true,
    status: 'estimate',
    pricingBasis: 'rate_table',
    cost,
    lineHaul: tableCost,
    ratePerMile: rule.ratePerMile,
    miles: mileage.miles,
    mileageMethod: mileage.method,
    truckType: shipment.truckType,
    timeframe: mileage.method === 'lane_history'
      ? `${rule.vehicleType} rate · carrier-reported miles`
      : `${rule.vehicleType} rate · estimated road miles`,
    fuelAdjustment: fuel || undefined,
    laneFactor: lane ? lane.factor : undefined,
    laneSamples: lane ? lane.samples : undefined,
    note: notes.length ? notes.join(' · ') : undefined
  };
}
