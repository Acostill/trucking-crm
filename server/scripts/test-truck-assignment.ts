import assert from 'assert';
import { UnifiedQuoteRequest } from '../types/quote';
import { applyValidatedAITruckRecommendation, assignTruckType, TRUCK_ASSIGNMENT_RULE_VERSION } from '../services/truckAssignment';

function shipment(
  pallets: number,
  weight: number,
  dimensions: { length: number; width: number; height: number } = { length: 48, width: 40, height: 48 },
  extra: Partial<UnifiedQuoteRequest> = {}
): UnifiedQuoteRequest {
  return {
    pieces: {
      quantity: pallets,
      unit: 'in',
      parts: [{ count: pallets, ...dimensions }]
    },
    weight: { value: weight, unit: 'lbs' },
    ...extra
  };
}

function expectAssigned(
  request: UnifiedQuoteRequest,
  truckType: string,
  datEquipmentType: 'Van' | 'Reefer'
) {
  const result = assignTruckType(request);
  assert.strictEqual(result.status, 'assigned');
  assert.strictEqual(result.shipment.truckType, truckType);
  assert.strictEqual(result.shipment.datEquipmentType, datEquipmentType);
  assert.strictEqual(result.metadata.ruleVersion, TRUCK_ASSIGNMENT_RULE_VERSION);
  return result;
}

function expectReview(request: UnifiedQuoteRequest, reasonCode: string) {
  const result = assignTruckType(request);
  assert.strictEqual(result.status, 'needs_review');
  assert.strictEqual(result.metadata.reasonCode, reasonCode);
  assert.strictEqual(result.shipment.truckType, undefined);
  assert.strictEqual(result.shipment.datEquipmentType, undefined);
}

function run() {
  expectAssigned(shipment(1, 500), 'Cargo Van', 'Van');
  expectAssigned(shipment(3, 3000), 'Cargo Van', 'Van');
  expectAssigned(shipment(3, 3001), 'Box Truck', 'Van');
  expectAssigned(shipment(3, 4300), 'Box Truck', 'Van');

  expectAssigned(shipment(4, 3000), 'Box Truck', 'Van');
  expectAssigned(shipment(8, 4300), 'Box Truck', 'Van');
  expectAssigned(shipment(3, 4301), 'Straight Truck', 'Van');
  expectAssigned(shipment(2, 4000), 'Box Truck', 'Van');
  expectAssigned(shipment(12, 10000), 'Straight Truck', 'Van');
  expectAssigned(shipment(2, 2000, { length: 73, width: 40, height: 48 }), 'Box Truck', 'Van');

  // September 21 failure: each crate fits a Cargo Van individually, but both
  // cannot share its 120 x 54 x 60 interior, even if stacking is allowed.
  const longCrates = shipment(2, 130, { length: 107, width: 31, height: 31 });
  expectAssigned(longCrates, 'Box Truck', 'Van');
  expectAssigned({ ...longCrates, stackable: false }, 'Box Truck', 'Van');
  expectAssigned({ ...longCrates, stackable: true }, 'Box Truck', 'Van');
  assert.strictEqual(applyValidatedAITruckRecommendation(longCrates, 'Cargo Van').accepted, false);
  const separateCrates = {
    ...longCrates,
    pieces: { quantity: 2, unit: 'in', parts: [
      { length: 107, width: 31, height: 31 },
      { length: 31, width: 107, height: 31 }
    ] }
  };
  expectAssigned(separateCrates, 'Box Truck', 'Van');
  expectAssigned(shipment(1, 130, { length: 107, width: 31, height: 31 }), 'Cargo Van', 'Van');

  // Exact side-by-side boundary, including a rotated footprint.
  expectAssigned(shipment(2, 130, { length: 107, width: 27, height: 31 }), 'Cargo Van', 'Van');
  expectAssigned(shipment(2, 130, { length: 27, width: 107, height: 31 }), 'Cargo Van', 'Van');
  expectAssigned(shipment(2, 130, { length: 107, width: 27.01, height: 31 }), 'Box Truck', 'Van');
  // Height cannot be substituted for width. Stacking requires confirmation.
  const shortCrates = shipment(2, 130, { length: 107, width: 31, height: 30 });
  expectAssigned(shortCrates, 'Box Truck', 'Van');
  expectAssigned({ ...shortCrates, stackable: false }, 'Box Truck', 'Van');
  expectAssigned({ ...shortCrates, stackable: true }, 'Cargo Van', 'Van');

  expectAssigned(shipment(13, 10000), 'Dry Van', 'Van');
  expectAssigned(shipment(12, 10001), 'Dry Van', 'Van');
  expectAssigned(shipment(26, 45000), 'Dry Van', 'Van');
  expectAssigned(shipment(5, 2500, undefined, { stackable: false }), 'Box Truck', 'Van');
  expectReview(
    shipment(8, 1000, { length: 96, width: 80, height: 10 }, { stackable: false }),
    'FIT_REQUIRES_STAFF_VALIDATION'
  );

  // The fit guard checks the entire shipment, not only the largest piece.
  expectAssigned(
    shipment(3, 2000, { length: 100, width: 50, height: 54 }),
    'Straight Truck',
    'Van'
  );

  const reefer = expectAssigned(
    shipment(2, 2500, undefined, { temperatureControl: { minC: 2, maxC: 8 } }),
    'Reefer Cargo Van',
    'Reefer'
  );
  assert.strictEqual(reefer.shipment.temperatureControlled, true);
  expectAssigned(
    shipment(3, 3000, undefined, { temperatureControlled: true }),
    'Reefer Box Truck',
    'Reefer'
  );
  expectAssigned(
    shipment(12, 9500, undefined, { temperatureControlled: true }),
    'Reefer Straight Truck',
    'Reefer'
  );
  expectAssigned(
    shipment(13, 9500, undefined, { temperatureControlled: true }),
    'Reefer Dry Van',
    'Reefer'
  );

  expectReview(shipment(27, 7000), 'CAPACITY_OUT_OF_RANGE');
  expectReview(shipment(10, 45001), 'CAPACITY_OUT_OF_RANGE');
  expectReview(shipment(10, 42001, undefined, { temperatureControlled: true }), 'CAPACITY_OUT_OF_RANGE');
  expectReview(shipment(2, 2000, { length: 637, width: 40, height: 48 }), 'OVERSIZED_ENCLOSED_FREIGHT');
  expectReview({ pieces: { quantity: 2, parts: [{}] }, weight: { value: 2000 } }, 'MISSING_REQUIRED_FREIGHT_DATA');
  expectReview({
    ...shipment(2, 2000),
    pieces: { quantity: 2, unit: 'cm', parts: [{ count: 2, length: 48, width: 40, height: 48 }] },
    weight: { value: 2000, unit: 'kg' }
  }, 'AMBIGUOUS_UNITS');
  expectReview(
    shipment(2, 2000, undefined, { temperatureControl: { minC: '' as any, maxC: '' as any } }),
    'TEMPERATURE_CONTROL_INCOMPLETE'
  );
  expectReview(shipment(2, 2000, undefined, { temperatureControl: { minC: 8, maxC: 2 } }), 'TEMPERATURE_CONTROL_INCOMPLETE');
  expectReview(
    shipment(2, 2000, undefined, {
      temperatureControlled: false,
      temperatureControl: { minC: 2, maxC: 8 }
    }),
    'TEMPERATURE_CONTROL_CONFLICT'
  );
  expectReview(
    shipment(2, 2000, undefined, { temperatureControlled: false, truckType: 'Reefer Cargo Van' }),
    'TEMPERATURE_CONTROL_CONFLICT'
  );

  const staffOverride = expectAssigned({
    ...shipment(2, 2000),
    truckType: 'Straight Truck',
    truckAssignment: {
      status: 'assigned',
      source: 'staff',
      ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
      reason: 'Truck type confirmed by staff.'
    }
  }, 'Straight Truck', 'Van');
  assert.strictEqual(staffOverride.metadata.source, 'staff');

  console.log('First Class truck-assignment rules passed.');
}

run();
