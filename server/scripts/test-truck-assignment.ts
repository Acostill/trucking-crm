import assert from 'assert';
import { UnifiedQuoteRequest } from '../types/quote';
import { assignTruckType, TRUCK_ASSIGNMENT_RULE_VERSION } from '../services/truckAssignment';

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

  expectAssigned(shipment(4, 3000), 'Box Truck', 'Van');
  expectAssigned(shipment(2, 4000), 'Box Truck', 'Van');
  expectAssigned(shipment(6, 6000), 'Box Truck', 'Van');
  expectAssigned(shipment(2, 2000, { length: 73, width: 40, height: 48 }), 'Box Truck', 'Van');

  expectAssigned(shipment(7, 6000), 'Straight Truck', 'Van');
  expectAssigned(shipment(6, 6001), 'Straight Truck', 'Van');
  expectAssigned(shipment(14, 8000), 'Straight Truck', 'Van');

  const reefer = expectAssigned(
    shipment(3, 3000, undefined, { temperatureControl: { minC: 2, maxC: 8 } }),
    'Reefer Cargo Van',
    'Reefer'
  );
  assert.strictEqual(reefer.shipment.temperatureControlled, true);
  expectAssigned(
    shipment(4, 5000, undefined, { temperatureControlled: true }),
    'Reefer Box Truck',
    'Reefer'
  );

  expectReview(shipment(15, 7000), 'CAPACITY_OUT_OF_RANGE');
  expectReview(shipment(10, 8001), 'CAPACITY_OUT_OF_RANGE');
  expectReview(shipment(2, 2000, { length: 121, width: 40, height: 48 }), 'OVERSIZED_ENCLOSED_FREIGHT');
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
