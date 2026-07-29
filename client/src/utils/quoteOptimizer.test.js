import {
  buildPlanningOptions,
  estimateLaneMiles,
  recommendEquipment
} from './quoteOptimizer';

const BASE_SHIPMENT = {
  originState: 'FL',
  destinationState: 'GA',
  serviceSpeed: 'standard',
  pallets: '2',
  length: '48',
  width: '40',
  height: '48',
  totalWeight: '1800',
  hazmat: false,
  accessorials: []
};

test('recommends LTL for a standard palletized shipment', function() {
  const result = recommendEquipment(BASE_SHIPMENT);
  expect(result.recommended.id).toBe('ltl');
  expect(result.fits.ltl).toBe(true);
});

test('recommends a sprinter van for compact expedited freight', function() {
  const result = recommendEquipment({
    ...BASE_SHIPMENT,
    serviceSpeed: 'expedited',
    pallets: '1',
    totalWeight: '800'
  });
  expect(result.recommended.id).toBe('sprinter');
});

test('recommends flatbed for oversized freight', function() {
  const result = recommendEquipment({ ...BASE_SHIPMENT, width: '120' });
  expect(result.recommended.id).toBe('flatbed');
  expect(result.fits.dry_van).toBe(false);
});

test('builds positive planning options with the selected equipment first', function() {
  const recommendation = recommendEquipment(BASE_SHIPMENT);
  const rates = buildPlanningOptions(BASE_SHIPMENT, recommendation, 'box_truck');
  expect(rates.length).toBeGreaterThan(1);
  expect(rates[0].equipmentId).toBe('box_truck');
  expect(rates.every(function(rate) { return rate.total > 0; })).toBe(true);
});

test('estimates a longer interstate lane than an intrastate lane', function() {
  expect(estimateLaneMiles('FL', 'NY')).toBeGreaterThan(estimateLaneMiles('FL', 'FL'));
});
