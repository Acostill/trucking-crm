import { UnifiedQuoteRequest } from '../types/quote';

/**
 * Decides where a quote's price comes from, the way a freight broker would:
 *
 * - Truckload (53' dry van / reefer / flatbed): DAT market rate. Trucks are
 *   found after the customer awards the load, so no carrier is asked first.
 * - Expedite (cargo van, box truck, straight truck): First Class's own
 *   per-mile buy-rate table. ExpediteAll (itself a broker) is only asked
 *   before award when no table rate exists yet for that vehicle.
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
  options: { hasRateTableRule?: boolean } = {}
): PricingPlan {
  const mode = pricingModeFor(shipment);
  const reasons: string[] = [];
  const callForwardAir = hasConfirmedFreightClass(shipment);
  if (!callForwardAir) reasons.push('Forward Air skipped: no confirmed LTL freight class.');

  const useRateTable = mode === 'expedite';
  const callExpediteAll = mode === 'expedite' &&
    !options.hasRateTableRule &&
    isExpediteAllRateable(shipment);
  if (mode === 'expedite' && options.hasRateTableRule) {
    reasons.push('ExpediteAll not asked before award: priced from the First Class rate table.');
  } else if (mode === 'expedite' && !callExpediteAll) {
    reasons.push('No rate-table entry for this vehicle yet; add one in Pricing settings.');
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
