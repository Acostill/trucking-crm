import db from '../db';
import { UnifiedQuoteRequest } from '../types/quote';
import { CarrierQuoteOption } from './carrierQuoteOptions';
import { estimateLaneMiles } from './laneHistory';
import { baseTruckType } from './quoteRouting';

/**
 * First Class's own expedite buy rates: what it expects to pay a van or
 * straight-truck driver per loaded mile, with a minimum for short runs.
 * The customer price is this cost plus the brokerage margin.
 */

export interface ExpediteRateRule {
  id: number;
  vehicleType: string;
  ratePerMile: number;
  minimumCharge: number;
  isActive: boolean;
  notes: string | null;
  updatedAt: string | null;
}

function rowToRule(row: any): ExpediteRateRule {
  return {
    id: Number(row.id),
    vehicleType: row.vehicle_type,
    ratePerMile: Number(row.rate_per_mile),
    minimumCharge: Number(row.minimum_charge),
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
    return result.rows.length ? rowToRule(result.rows[0]) : null;
  } catch (err: any) {
    // Missing migration: behave as if no rate is configured.
    console.error('Expedite rate rule lookup failed:', err && err.message ? err.message : err);
    return null;
  }
}

export function priceFromRule(rule: ExpediteRateRule, miles: number): number {
  const lineHaul = miles * rule.ratePerMile;
  return Number(Math.max(lineHaul, rule.minimumCharge).toFixed(2));
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
  const cost = priceFromRule(rule, mileage.miles);
  return {
    key: 'rateTable',
    source: 'First Class rate table',
    available: true,
    selectable: true,
    benchmark: true,
    status: 'estimate',
    pricingBasis: 'rate_table',
    cost,
    lineHaul: cost,
    ratePerMile: rule.ratePerMile,
    miles: mileage.miles,
    mileageMethod: mileage.method,
    truckType: shipment.truckType,
    timeframe: mileage.method === 'lane_history'
      ? `${rule.vehicleType} rate · carrier-reported miles`
      : `${rule.vehicleType} rate · estimated road miles`,
    note: cost === rule.minimumCharge ? 'Minimum charge applies.' : undefined
  };
}
