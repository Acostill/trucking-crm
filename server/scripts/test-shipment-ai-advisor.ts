import assert from 'assert';
import { UnifiedQuoteRequest } from '../types/quote';
import { assignTruckType } from '../services/truckAssignment';
import { applyModelRecommendation } from '../services/shipmentAIAdvisor';

function shipment(overrides: Partial<UnifiedQuoteRequest> = {}): UnifiedQuoteRequest {
  return {
    pickup: { location: { city: 'Miami', state: 'FL', zip: '33101' }, date: '2026-09-10' },
    delivery: { location: { city: 'Orlando', state: 'FL', zip: '32801' } },
    pieces: { quantity: 5, unit: 'in', parts: [{ count: 5, length: 80, width: 48, height: 60 }] },
    weight: { value: 6000, unit: 'lbs' },
    temperatureControlled: false,
    ...overrides
  };
}

function recommendation(truckType: any) {
  return {
    recommendedTruckType: truckType,
    confidence: 'high' as const,
    fitAnalysis: 'Capacity and dimensions were checked.',
    suggestions: ['Confirm pickup hours.'],
    risks: []
  };
}

const deterministic = assignTruckType(shipment()).shipment;
assert.equal(deterministic.truckType, 'Box Truck');

const safe = applyModelRecommendation(deterministic, recommendation('Straight Truck'), 'test-model');
assert.equal(safe.advisor.accepted, true);
assert.equal(safe.shipment.truckType, 'Straight Truck');
assert.equal(safe.shipment.truckAssignment?.source, 'ai');
assert.equal(safe.shipment.datEquipmentType, 'Van');

const undersized = applyModelRecommendation(deterministic, recommendation('Cargo Van'), 'test-model');
assert.equal(undersized.advisor.accepted, false);
assert.equal(undersized.shipment.truckType, 'Box Truck');
assert.match(undersized.advisor.risks[0], /safeguards/i);

const refrigerated = assignTruckType(shipment({ temperatureControlled: true })).shipment;
const dryMismatch = applyModelRecommendation(refrigerated, recommendation('Box Truck'), 'test-model');
assert.equal(dryMismatch.advisor.accepted, false);
assert.equal(dryMismatch.shipment.truckType, 'Reefer Box Truck');

const staff = assignTruckType({
  ...shipment(),
  truckType: 'Straight Truck',
  truckAssignment: {
    status: 'assigned',
    source: 'staff',
    reason: 'Staff confirmed.',
    ruleVersion: 'test'
  }
}).shipment;
const staffPreserved = applyModelRecommendation(staff, recommendation('Box Truck'), 'test-model');
assert.equal(staffPreserved.advisor.accepted, false);
assert.equal(staffPreserved.shipment.truckType, 'Straight Truck');
assert.match(String(staffPreserved.advisor.note), /Staff-confirmed/);

console.log('Shipment AI advisor safeguard checks passed.');
