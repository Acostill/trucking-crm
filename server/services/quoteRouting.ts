import { UnifiedQuoteRequest } from '../types/quote';

/**
 * Decides where a quote's price comes from, the way a freight broker would:
 *
 * - Truckload (53' dry van / reefer / flatbed): DAT market rate. Trucks are
 *   found after the customer awards the load, so no carrier is asked first.
 * - Expedite (cargo van, box truck, straight truck): First Class's own
 *   per-mile buy-rate table, shown next to a live ExpediteAll cargo-van rate
 *   while the pricing setting asks for it (the default) or when no table rate
 *   exists. With the setting off, ExpediteAll is only asked after award.
 * - LTL: Forward Air's rating API whenever a freight class is confirmed;
 *   LTL carriers expect to be rated on every quote.
 */

export type PricingMode = 'truckload' | 'expedite' | 'unassigned';

export interface PricingPlan {
  mode: PricingMode;
  baseTruckType: string | null;
  callForwardAir: boolean;
  callExpediteAll: boolean;
  useRateTable: boolean;
  queueDat: boolean;
  reasons: string[];
}

const EXPEDITE_TYPES = ['Cargo Van', 'Box Truck', 'Straight Truck'];
const EXPEDITE_ALL_MAX_WEIGHT_LB = 3000;

export function baseTruckType(shipment: UnifiedQuoteRequest): string | null {
  const truckType = String(shipment && shipment.truckType || '').trim();
  if (!truckType) return null;
  return truckType.replace(/^Reefer\s+/i, '');
}

export function pricingModeFor(shipment: UnifiedQuoteRequest): PricingMode {
  const base = baseTruckType(shipment);
  if (!base) return 'unassigned';
  if (EXPEDITE_TYPES.indexOf(base) > -1) return 'expedite';
  if (/dry van|flatbed/i.test(base)) return 'truckload';
  return 'unassigned';
}

export function hasConfirmedFreightClass(shipment: UnifiedQuoteRequest): boolean {
  const normalized = String(shipment && shipment.forwardAirFreightClass || '').trim();
  const parsed = Number(normalized);
  return /^\d{1,3}(?:\.5)?$/.test(normalized) && parsed >= 50 && parsed <= 500;
}

export function isExpediteAllRateable(shipment: UnifiedQuoteRequest): boolean {
  if (baseTruckType(shipment) !== 'Cargo Van') return false;
  const weight = Number(shipment.weight && shipment.weight.value);
  return !Number.isFinite(weight) || weight <= EXPEDITE_ALL_MAX_WEIGHT_LB;
}

export function buildPricingPlan(
  shipment: UnifiedQuoteRequest,
  options: { hasRateTableRule?: boolean; expediteAllBeforeAward?: boolean } = {}
): PricingPlan {
  const mode = pricingModeFor(shipment);
  const reasons: string[] = [];
  // LTL only: a full truckload is never rated as partial freight.
  const callForwardAir = hasConfirmedFreightClass(shipment) && mode !== 'truckload';
  if (!hasConfirmedFreightClass(shipment)) reasons.push('Forward Air skipped: no confirmed LTL freight class.');

  const useRateTable = mode === 'expedite';
  // Until the rate table is proven against real carrier prices, ExpediteAll
  // is asked on every cargo-van quote (the default). Without a table rate it
  // is always asked, since it is then the only price source.
  const askBeforeAward = options.expediteAllBeforeAward !== false || !options.hasRateTableRule;
  const callExpediteAll = mode === 'expedite' && askBeforeAward && isExpediteAllRateable(shipment);
  if (mode === 'expedite' && !callExpediteAll && options.hasRateTableRule && isExpediteAllRateable(shipment)) {
    reasons.push('ExpediteAll not asked before award: priced from the First Class rate table.');
  }
  if (mode === 'expedite' && !options.hasRateTableRule) {
    reasons.push('No rate-table entry for this vehicle yet; add one on the Pricing page.');
  }

  const queueDat = mode === 'truckload';
  if (mode === 'expedite') reasons.push('DAT skipped: DAT prices 53\' trucks, not expedite vehicles.');

  return {
    mode,
    baseTruckType: baseTruckType(shipment),
    callForwardAir,
    callExpediteAll,
    useRateTable,
    queueDat,
    reasons
  };
}

/**
 * Only these fields change what a load costs. Edits to anything else
 * (contact details, notes, references) must not trigger new carrier calls.
 */
export function pricingFingerprint(shipment: UnifiedQuoteRequest): string {
  const pickup = (shipment && shipment.pickup) || {};
  const delivery = (shipment && shipment.delivery) || {};
  const pieces = (shipment && shipment.pieces) || {};
  const location = function(loc: any) {
    loc = loc || {};
    return [
      String(loc.zip || '').trim(),
      String(loc.city || '').trim().toLowerCase(),
      String(loc.state || loc.state_code || '').trim().toUpperCase()
    ];
  };
  return JSON.stringify({
    pickup: location(pickup.location),
    pickupDate: String(pickup.date || '').slice(0, 10),
    delivery: location(delivery.location),
    quantity: pieces.quantity || null,
    parts: (pieces.parts || []).map(function(part: any) {
      return [part.count || 1, part.length || null, part.width || null, part.height || null];
    }),
    weight: shipment && shipment.weight ? shipment.weight.value || null : null,
    truckType: shipment && shipment.truckType || null,
    freightClass: shipment && shipment.forwardAirFreightClass || null,
    hazmat: (shipment && shipment.hazardousMaterial && shipment.hazardousMaterial.unNumbers || []).slice().sort(),
    accessorials: (shipment && shipment.accessorialCodes || []).slice().sort(),
    temperature: shipment && shipment.temperatureControlled || null
  });
}
