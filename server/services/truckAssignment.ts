import { Piece, UnifiedQuoteRequest } from '../types/quote';

export const TRUCK_ASSIGNMENT_RULE_VERSION = 'fct-truck-assignment-v5';

export type TruckAssignmentStatus = 'assigned' | 'needs_review';
export type TruckAssignmentSource = 'auto' | 'ai' | 'staff';
export type TruckServiceCategory = 'dry' | 'reefer';
export type SupportedTruckType =
  | 'Cargo Van'
  | 'Box Truck'
  | 'Straight Truck'
  | 'Dry Van'
  | 'Reefer Cargo Van'
  | 'Reefer Box Truck'
  | 'Reefer Straight Truck'
  | 'Reefer Dry Van';

export interface TruckAssignmentMetadata {
  status: TruckAssignmentStatus;
  source: TruckAssignmentSource;
  ruleVersion: string;
  reasonCode?: string;
  reason: string;
  baseTruckType?: string;
  serviceCategory?: TruckServiceCategory;
  fitSummary?: string;
}

export interface TruckAssignmentResult {
  status: TruckAssignmentStatus;
  shipment: UnifiedQuoteRequest;
  metadata: TruckAssignmentMetadata;
}

export interface TruckCapacityRule {
  baseTruckType: 'Cargo Van' | 'Box Truck' | 'Straight Truck' | 'Dry Van';
  serviceCategory: TruckServiceCategory;
  palletMax: number;
  weightMax: number;
  dimensions: { length: number; width: number; height: number };
  cubicFeetMax: number;
  floorSquareFeetMax: number;
}

export interface AutomaticAssignmentProfile {
  truckType: SupportedTruckType;
  automaticAssignmentLimit: {
    maxPallets: number;
    maxWeightLb: number;
    maxCubicFeet: number;
    maxFloorSquareFeet: number;
    interiorDimensionsIn: { length: number; width: number; height: number };
  };
  meaning: string;
}

/**
 * Conservative default equipment classes for automatic assignment.
 *
 * They intentionally sit below the largest available configuration: a specific
 * carrier's equipment, axle weights, liftgate, loading method, or temperature
 * unit may further reduce usable capacity. The rules are therefore an
 * assignment guard, not a promise of carrier capacity.
 *
 * Sources reviewed September 2026:
 * - Ford Transit technical specifications (cargo van payload and load area)
 * - Penske 16 ft box-truck specifications (4,300 lb, 16 x 7 ft 7 in x 6 ft 6 in)
 * - Ryder straight-truck specifications (up to 13,000 lb capacity)
 * - Great Dane / Utility 53 ft van specifications (about 100 in internal width,
 *   26–30 pallet space; refrigeration insulation reduces usable space/payload)
 */
export const CAPACITY_RULES: TruckCapacityRule[] = [
  {
    baseTruckType: 'Cargo Van',
    serviceCategory: 'dry',
    palletMax: 3,
    weightMax: 3000,
    dimensions: { length: 120, width: 54, height: 60 },
    cubicFeetMax: 225,
    floorSquareFeetMax: 42
  },
  {
    baseTruckType: 'Box Truck',
    serviceCategory: 'dry',
    palletMax: 8,
    weightMax: 4300,
    dimensions: { length: 192, width: 91, height: 78 },
    cubicFeetMax: 800,
    floorSquareFeetMax: 110
  },
  {
    baseTruckType: 'Straight Truck',
    serviceCategory: 'dry',
    palletMax: 12,
    weightMax: 10000,
    dimensions: { length: 312, width: 96, height: 96 },
    cubicFeetMax: 1600,
    floorSquareFeetMax: 190
  },
  {
    baseTruckType: 'Dry Van',
    serviceCategory: 'dry',
    palletMax: 26,
    weightMax: 45000,
    dimensions: { length: 636, width: 100, height: 108 },
    cubicFeetMax: 3900,
    floorSquareFeetMax: 410
  },
  {
    baseTruckType: 'Cargo Van',
    serviceCategory: 'reefer',
    palletMax: 2,
    weightMax: 2500,
    dimensions: { length: 110, width: 48, height: 54 },
    cubicFeetMax: 165,
    floorSquareFeetMax: 34
  },
  {
    baseTruckType: 'Box Truck',
    serviceCategory: 'reefer',
    palletMax: 6,
    weightMax: 4000,
    dimensions: { length: 186, width: 88, height: 76 },
    cubicFeetMax: 700,
    floorSquareFeetMax: 105
  },
  {
    baseTruckType: 'Straight Truck',
    serviceCategory: 'reefer',
    palletMax: 12,
    weightMax: 9500,
    dimensions: { length: 300, width: 92, height: 92 },
    cubicFeetMax: 1450,
    floorSquareFeetMax: 180
  },
  {
    baseTruckType: 'Dry Van',
    serviceCategory: 'reefer',
    palletMax: 26,
    weightMax: 42000,
    dimensions: { length: 620, width: 98, height: 102 },
    cubicFeetMax: 3500,
    floorSquareFeetMax: 390
  }
];

/**
 * Context supplied to AI assistants. The names deliberately distinguish a
 * conservative CRM guardrail from a carrier's actual vehicle specification.
 */
export function automaticAssignmentProfiles(): AutomaticAssignmentProfile[] {
  return CAPACITY_RULES.map(function(rule) {
    const truckType = (rule.serviceCategory === 'reefer'
      ? reeferVariant(rule.baseTruckType)
      : rule.baseTruckType) as SupportedTruckType;
    return {
      truckType,
      automaticAssignmentLimit: {
        maxPallets: rule.palletMax,
        maxWeightLb: rule.weightMax,
        maxCubicFeet: rule.cubicFeetMax,
        maxFloorSquareFeet: rule.floorSquareFeetMax,
        interiorDimensionsIn: { ...rule.dimensions }
      },
      meaning: 'Conservative CRM automatic-assignment guardrail, not a hard carrier or vehicle capacity. maxPallets means standard pallet positions, never individual pieces. Carrier equipment must be confirmed before booking.'
    };
  });
}

const STAFF_TRUCK_TYPES = new Set([
  'Cargo Van',
  'Box Truck',
  'Straight Truck',
  'Dry Van',
  'Reefer Cargo Van',
  'Reefer Box Truck',
  'Reefer Straight Truck',
  'Reefer Dry Van'
]);

export const SUPPORTED_TRUCK_TYPES = Array.from(STAFF_TRUCK_TYPES) as SupportedTruckType[];

function finitePositive(value: any): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInteger(value: any): number | null {
  const number = finitePositive(value);
  return number != null && Number.isInteger(number) ? number : null;
}

function finiteTemperature(value: any): number | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasCanonicalUnits(shipment: UnifiedQuoteRequest): boolean {
  const dimensionUnit = String(shipment.pieces && shipment.pieces.unit || '').trim().toLowerCase();
  const weightUnit = String(shipment.weight && shipment.weight.unit || '').trim().toLowerCase();
  return ['in', 'inch', 'inches'].includes(dimensionUnit) &&
    ['lb', 'lbs', 'pound', 'pounds'].includes(weightUnit);
}

function temperatureCategory(shipment: UnifiedQuoteRequest): {
  category?: TruckServiceCategory;
  reasonCode?: string;
  reason?: string;
} {
  const control: any = shipment.temperatureControl;
  const flag = shipment.temperatureControlled;
  const namedReefer = /reefer|refrigerat|temperature.?control/i.test(String(shipment.truckType || ''));

  if (control != null) {
    const minC = finiteTemperature(control.minC != null ? control.minC : control.min_c);
    const maxC = finiteTemperature(control.maxC != null ? control.maxC : control.max_c);
    if (minC == null || maxC == null || minC > maxC) {
      return {
        reasonCode: 'TEMPERATURE_CONTROL_INCOMPLETE',
        reason: 'Temperature-control details are incomplete or invalid. Staff must confirm dry or reefer service.'
      };
    }
    if (flag === false) {
      return {
        reasonCode: 'TEMPERATURE_CONTROL_CONFLICT',
        reason: 'Temperature-control details conflict with the dry-service selection.'
      };
    }
    return { category: 'reefer' };
  }

  if (flag === false && namedReefer) {
    return {
      reasonCode: 'TEMPERATURE_CONTROL_CONFLICT',
      reason: 'The truck label requests reefer service but the temperature-control selection is dry.'
    };
  }
  if (flag === true || namedReefer) return { category: 'reefer' };
  return { category: 'dry' };
}

function validParts(shipment: UnifiedQuoteRequest): Piece[] | null {
  const parts = shipment.pieces && Array.isArray(shipment.pieces.parts)
    ? shipment.pieces.parts
    : [];
  if (!parts.length) return null;
  const valid = parts.every(function(part) {
    return finitePositive(part.length) != null &&
      finitePositive(part.width) != null &&
      finitePositive(part.height) != null &&
      positiveInteger(part.count == null ? 1 : part.count) != null;
  });
  return valid ? parts : null;
}

function partFits(part: Piece, rule: TruckCapacityRule): boolean {
  const length = Number(part.length);
  const width = Number(part.width);
  const height = Number(part.height);
  if (height > rule.dimensions.height) return false;
  return (length <= rule.dimensions.length && width <= rule.dimensions.width) ||
    (width <= rule.dimensions.length && length <= rule.dimensions.width);
}

function totalCubicFeet(parts: Piece[]): number {
  return parts.reduce(function(total, part) {
    return total + (Number(part.length) * Number(part.width) * Number(part.height) * Number(part.count || 1)) / 1728;
  }, 0);
}

function totalFloorSquareFeet(parts: Piece[]): number {
  return parts.reduce(function(total, part) {
    return total + (Number(part.length) * Number(part.width) * Number(part.count || 1)) / 144;
  }, 0);
}

function partsFit(parts: Piece[], rule: TruckCapacityRule): boolean {
  return parts.every(function(part) {
    return partFits(part, rule);
  });
}

function shipmentFitsRule(
  pallets: number,
  weight: number,
  parts: Piece[],
  rule: TruckCapacityRule,
  requireFloorFit = false
): boolean {
  return pallets <= rule.palletMax &&
    weight <= rule.weightMax &&
    totalCubicFeet(parts) <= rule.cubicFeetMax &&
    (!requireFloorFit || totalFloorSquareFeet(parts) <= rule.floorSquareFeetMax) &&
    partsFit(parts, rule);
}

function reeferVariant(baseTruckType: TruckCapacityRule['baseTruckType']): string {
  return `Reefer ${baseTruckType}`;
}

function datEquipmentFor(truckType: string): 'Van' | 'Reefer' {
  return /^Reefer\b/i.test(truckType) ? 'Reefer' : 'Van';
}

function reviewResult(
  shipment: UnifiedQuoteRequest,
  reasonCode: string,
  reason: string
): TruckAssignmentResult {
  const next: UnifiedQuoteRequest = { ...shipment };
  delete next.truckType;
  delete next.datEquipmentType;
  const metadata: TruckAssignmentMetadata = {
    status: 'needs_review',
    source: 'auto',
    ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
    reasonCode,
    reason
  };
  next.truckAssignment = metadata;
  return { status: 'needs_review', shipment: next, metadata };
}

export function assignTruckType(shipment: UnifiedQuoteRequest): TruckAssignmentResult {
  const pallets = positiveInteger(shipment.pieces && shipment.pieces.quantity);
  const weight = finitePositive(shipment.weight && shipment.weight.value);
  const parts = validParts(shipment);
  if (pallets == null || weight == null || !parts) {
    return reviewResult(
      shipment,
      'MISSING_REQUIRED_FREIGHT_DATA',
      'Pallet count, total weight, and complete dimensions are required before assigning a truck.'
    );
  }

  if (!hasCanonicalUnits(shipment)) {
    return reviewResult(
      shipment,
      'AMBIGUOUS_UNITS',
      'Dimensions must be supplied in inches and total weight in pounds before assigning a truck.'
    );
  }

  const prior = shipment.truckAssignment as TruckAssignmentMetadata | undefined;
  const staffTruckType = String(shipment.truckType || '').trim();
  if (prior && prior.source === 'staff' && STAFF_TRUCK_TYPES.has(staffTruckType)) {
    const serviceCategory: TruckServiceCategory = /^Reefer\b/i.test(staffTruckType) ? 'reefer' : 'dry';
    const next: UnifiedQuoteRequest = {
      ...shipment,
      datEquipmentType: datEquipmentFor(staffTruckType),
      temperatureControlled: serviceCategory === 'reefer'
    };
    const metadata: TruckAssignmentMetadata = {
      status: 'assigned',
      source: 'staff',
      ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
      reason: 'Truck type confirmed by staff.',
      baseTruckType: staffTruckType.replace(/^Reefer\s+/i, ''),
      serviceCategory
    };
    next.truckAssignment = metadata;
    return { status: 'assigned', shipment: next, metadata };
  }

  const temperature = temperatureCategory(shipment);
  if (!temperature.category) {
    return reviewResult(
      shipment,
      temperature.reasonCode || 'TEMPERATURE_CONTROL_CONFLICT',
      temperature.reason || 'Staff must confirm dry or reefer service.'
    );
  }

  const serviceRules = CAPACITY_RULES.filter(function(rule) {
    return rule.serviceCategory === temperature.category;
  });
  const largestRule = serviceRules[serviceRules.length - 1];
  if (!largestRule || pallets > largestRule.palletMax || weight > largestRule.weightMax) {
    return reviewResult(
      shipment,
      'CAPACITY_OUT_OF_RANGE',
      `This shipment exceeds the automatic ${temperature.category === 'reefer' ? 'refrigerated' : 'dry'} enclosed-trailer limit of ${largestRule ? largestRule.palletMax : 26} pallets or ${(largestRule ? largestRule.weightMax : 45000).toLocaleString('en-US')} lb.`
    );
  }

  const selected = serviceRules.find(function(rule) {
    return shipmentFitsRule(pallets, weight, parts, rule, shipment.stackable === false);
  });
  if (!selected) {
    const oversized = !partsFit(parts, largestRule);
    return reviewResult(
      shipment,
      oversized ? 'OVERSIZED_ENCLOSED_FREIGHT' : 'FIT_REQUIRES_STAFF_VALIDATION',
      oversized
        ? `The freight dimensions exceed the automatic ${temperature.category === 'reefer' ? 'Reefer Dry Van' : 'Dry Van'} fit guard.`
        : 'The shipment exceeds an automatic cube or loading-fit guard and requires staff review.'
    );
  }

  const truckType = temperature.category === 'reefer'
    ? reeferVariant(selected.baseTruckType)
    : selected.baseTruckType;
  const metadata: TruckAssignmentMetadata = {
    status: 'assigned',
    source: 'auto',
    ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
    reason: `Smallest ${temperature.category === 'reefer' ? 'refrigerated' : 'dry'} truck within ${selected.palletMax} pallets, ${selected.weightMax.toLocaleString('en-US')} lb, ${selected.cubicFeetMax.toLocaleString('en-US')} cu ft, and the interior-dimension guard.`,
    baseTruckType: selected.baseTruckType,
    serviceCategory: temperature.category,
    fitSummary: `${pallets} pallet${pallets === 1 ? '' : 's'} · ${weight.toLocaleString('en-US')} lb · ${totalCubicFeet(parts).toFixed(1)} cu ft · largest piece ${Math.max(...parts.map(function(part) { return Number(part.length); }))}×${Math.max(...parts.map(function(part) { return Number(part.width); }))}×${Math.max(...parts.map(function(part) { return Number(part.height); }))} in`
  };
  const next: UnifiedQuoteRequest = {
    ...shipment,
    truckType,
    datEquipmentType: datEquipmentFor(truckType),
    temperatureControlled: temperature.category === 'reefer',
    truckAssignment: metadata
  };
  return { status: 'assigned', shipment: next, metadata };
}

export function isStaffTruckType(value: any): boolean {
  return STAFF_TRUCK_TYPES.has(String(value || '').trim());
}

export interface AITruckValidationResult {
  accepted: boolean;
  shipment: UnifiedQuoteRequest;
  reason: string;
}

/**
 * Applies a model recommendation only when it passes the same hard capacity,
 * dimension, stackability, and temperature-service rules used by the CRM.
 * Staff choices always remain authoritative.
 */
export function applyValidatedAITruckRecommendation(
  shipment: UnifiedQuoteRequest,
  recommendedTruckType: any,
  modelReason?: string
): AITruckValidationResult {
  const current = assignTruckType(shipment).shipment;
  const prior = current.truckAssignment as TruckAssignmentMetadata | undefined;
  if (prior && prior.source === 'staff') {
    return {
      accepted: false,
      shipment: current,
      reason: 'Staff-confirmed equipment was preserved.'
    };
  }

  const truckType = String(recommendedTruckType || '').trim() as SupportedTruckType;
  if (!STAFF_TRUCK_TYPES.has(truckType)) {
    return { accepted: false, shipment: current, reason: 'The AI recommendation is not a supported truck type.' };
  }

  const pallets = positiveInteger(current.pieces && current.pieces.quantity);
  const weight = finitePositive(current.weight && current.weight.value);
  const parts = validParts(current);
  const service = temperatureCategory(current);
  const isReefer = /^Reefer\b/i.test(truckType);
  const baseTruckType = truckType.replace(/^Reefer\s+/i, '') as TruckCapacityRule['baseTruckType'];
  const rule = CAPACITY_RULES.find(function(candidate) {
    return candidate.baseTruckType === baseTruckType && candidate.serviceCategory === service.category;
  });

  if (
    !rule || pallets == null || weight == null || !parts || !hasCanonicalUnits(current) ||
    !service.category || isReefer !== (service.category === 'reefer') ||
    !shipmentFitsRule(pallets, weight, parts, rule, current.stackable === false)
  ) {
    return {
      accepted: false,
      shipment: current,
      reason: 'The AI recommendation did not pass the deterministic capacity and service safeguards.'
    };
  }

  const next: UnifiedQuoteRequest = {
    ...current,
    truckType,
    datEquipmentType: datEquipmentFor(truckType),
    temperatureControlled: service.category === 'reefer'
  };
  const metadata: TruckAssignmentMetadata = {
    status: 'assigned',
    source: 'ai',
    ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
    reason: modelReason || 'OpenAI recommended this equipment and the CRM capacity safeguards confirmed the fit.',
    baseTruckType,
    serviceCategory: service.category,
    fitSummary: prior && prior.fitSummary
  };
  next.truckAssignment = metadata;
  return { accepted: true, shipment: next, reason: metadata.reason };
}
