import { Piece, UnifiedQuoteRequest } from '../types/quote';

export const TRUCK_ASSIGNMENT_RULE_VERSION = 'fct-truck-assignment-v1';

export type TruckAssignmentStatus = 'assigned' | 'needs_review';
export type TruckAssignmentSource = 'auto' | 'staff';
export type TruckServiceCategory = 'dry' | 'reefer';

export interface TruckAssignmentMetadata {
  status: TruckAssignmentStatus;
  source: TruckAssignmentSource;
  ruleVersion: string;
  reasonCode?: string;
  reason: string;
  baseTruckType?: string;
  serviceCategory?: TruckServiceCategory;
}

export interface TruckAssignmentResult {
  status: TruckAssignmentStatus;
  shipment: UnifiedQuoteRequest;
  metadata: TruckAssignmentMetadata;
}

interface TruckCapacityRule {
  baseTruckType: 'Cargo Van' | 'Box Truck' | 'Straight Truck';
  palletMax: number;
  weightMax: number;
  dimensions: { length: number; width: number; height: number };
}

const CAPACITY_RULES: TruckCapacityRule[] = [
  {
    baseTruckType: 'Cargo Van',
    palletMax: 3,
    weightMax: 3000,
    dimensions: { length: 72, width: 52, height: 70 }
  },
  {
    baseTruckType: 'Box Truck',
    palletMax: 6,
    weightMax: 6000,
    dimensions: { length: 96, width: 96, height: 96 }
  },
  {
    baseTruckType: 'Straight Truck',
    palletMax: 14,
    weightMax: 8000,
    dimensions: { length: 120, width: 102, height: 110 }
  }
];

const STAFF_TRUCK_TYPES = new Set([
  'Cargo Van',
  'Box Truck',
  'Straight Truck',
  'Reefer Cargo Van',
  'Reefer Box Truck',
  'Reefer Straight Truck'
]);

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

function partsFit(parts: Piece[], rule: TruckCapacityRule): boolean {
  return parts.every(function(part) {
    return Number(part.length) <= rule.dimensions.length &&
      Number(part.width) <= rule.dimensions.width &&
      Number(part.height) <= rule.dimensions.height;
  });
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

  if (pallets > 14 || weight > 8000) {
    return reviewResult(
      shipment,
      'CAPACITY_OUT_OF_RANGE',
      'This shipment exceeds the automatic limit of 14 pallets or 8,000 lb.'
    );
  }

  const selected = CAPACITY_RULES.find(function(rule) {
    return pallets <= rule.palletMax && weight <= rule.weightMax && partsFit(parts, rule);
  });
  if (!selected) {
    const straight = CAPACITY_RULES[CAPACITY_RULES.length - 1];
    const oversized = !partsFit(parts, straight);
    return reviewResult(
      shipment,
      oversized ? 'OVERSIZED_ENCLOSED_FREIGHT' : 'FIT_REQUIRES_STAFF_VALIDATION',
      oversized
        ? 'The freight dimensions exceed the automatic Straight Truck fit guard.'
        : 'The freight does not fit one automatic truck rule and requires staff review.'
    );
  }

  const truckType = temperature.category === 'reefer'
    ? reeferVariant(selected.baseTruckType)
    : selected.baseTruckType;
  const metadata: TruckAssignmentMetadata = {
    status: 'assigned',
    source: 'auto',
    ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
    reason: `Smallest truck within ${selected.palletMax} pallets, ${selected.weightMax.toLocaleString('en-US')} lb, and the v1 dimension guard.`,
    baseTruckType: selected.baseTruckType,
    serviceCategory: temperature.category
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
