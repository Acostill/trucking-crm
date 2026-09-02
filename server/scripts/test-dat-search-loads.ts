import assert from 'assert';
import { mergeDatCarrierOptions } from '../services/carrierQuoteOptions';
import {
  DAT_SEARCH_LOADS_WORKFLOW_ID,
  buildDatSearchLoadsRequest,
  isDatSearchPickupDateCurrentOrFuture,
  mapDatSearchLoadsResult,
  validateDatSearchLoadsResult
} from '../services/datRateViewJobs';

function offer(rank: number, totalUsd: number) {
  return {
    rank,
    datLoadId: `table-row-test-${rank}`,
    sourceOrder: rank - 1,
    displayedTotal: `$${totalUsd.toLocaleString('en-US')}`,
    totalUsd,
    rpm: '$2.50/mi',
    tripMiles: '1,000 mi',
    origin: 'Portland, OR',
    destination: 'Chicago, IL',
    originDeadhead: 'DH-O 15 mi',
    destinationDeadhead: 'DH-D 20 mi',
    pickup: 'Aug 13',
    equipmentCode: 'V',
    weight: '8,000 lbs',
    lengthLoadType: '53 ft · Full',
    company: `Safe Carrier ${rank}`,
    creditScore: '95',
    daysToPay: '20 DTP',
    comments: rank === 1 ? 'Appointment required.' : null,
    commentsStatus: rank === 1 ? 'displayed' : 'not_displayed'
  };
}

function run() {
  const validationNow = new Date('2026-09-02T15:00:00Z');
  assert.strictEqual(
    isDatSearchPickupDateCurrentOrFuture('2026-09-01', validationNow),
    false
  );
  assert.strictEqual(
    isDatSearchPickupDateCurrentOrFuture('2026-09-02', validationNow),
    true
  );

  const candidate = buildDatSearchLoadsRequest('email-quote-search-test', {
    pickup: {
      location: { city: 'Portland', state: 'OR' },
      date: '2026-08-13T12:00:00.000Z'
    },
    delivery: { location: { city: 'Chicago', state: 'IL' } },
    datEquipmentType: 'Van'
  });
  assert(candidate);
  assert.strictEqual(candidate.request.workflowId, DAT_SEARCH_LOADS_WORKFLOW_ID);
  assert.strictEqual(candidate.request.equipmentType, 'Vans (Standard)');
  assert.strictEqual(candidate.request.pickupDate, '2026-08-13');
  assert.strictEqual(candidate.request.originDeadheadMiles, 150);
  assert.strictEqual(candidate.request.destinationDeadheadMiles, 150);
  assert.strictEqual(candidate.request.includeSimilarResults, false);

  const offers = [offer(1, 4500), offer(2, 4200), offer(3, 3900)];
  const result = validateDatSearchLoadsResult({
    workflowId: DAT_SEARCH_LOADS_WORKFLOW_ID,
    schemaVersion: 1,
    requestId: candidate.request.requestId,
    shipmentRecordId: 'email-quote-search-test',
    searchFingerprint: candidate.fingerprint,
    source: 'DAT Search Loads',
    searchTimestamp: '2026-08-13T16:34:43.226Z',
    acceptedCriteria: {
      origin: 'Portland, OR',
      destination: 'Chicago, IL',
      equipmentType: 'Vans (Standard)',
      pickupDate: '2026-08-13',
      originDeadheadMiles: 150,
      destinationDeadheadMiles: 150,
      loadType: 'Full & Partial',
      includeSimilarResults: false,
      sort: 'Rate - Highest'
    },
    directResultCount: 4,
    eligibleCount: 3,
    excludedCount: 1,
    exclusionReasons: { MISSING_OR_NON_NUMERIC_OFFER: 1 },
    duplicateCount: 0,
    outcome: 'completed',
    offers
  });
  assert.strictEqual(result.offers.length, 3);
  assert.strictEqual(result.offers[0].comments, 'Appointment required.');

  const mapped = mapDatSearchLoadsResult(result);
  assert.strictEqual(mapped.key, 'datLoadOffers');
  assert.strictEqual(mapped.selectable, false);
  assert.strictEqual(mapped.offers?.length, 3);

  const merged = mergeDatCarrierOptions([
    { key: 'forwardAir', source: 'Forward Air', available: true, cost: 1200 },
    { key: 'datSpot', source: 'DAT Spot Market', available: true, benchmark: true },
    { key: 'datLoadOffers', source: 'Old Search Loads', available: false }
  ], [mapped]);
  assert.strictEqual(merged.filter(function(option) { return option.key === 'datLoadOffers'; }).length, 1);
  assert.strictEqual(merged.filter(function(option) { return option.key === 'datSpot'; }).length, 1);
  assert.strictEqual(merged.filter(function(option) { return option.key === 'forwardAir'; }).length, 1);

  assert.throws(function() {
    validateDatSearchLoadsResult({
      ...result,
      offers: [offer(1, 3900), offer(2, 4500)],
      directResultCount: 2,
      eligibleCount: 2,
      excludedCount: 0,
      exclusionReasons: {}
    });
  }, /not sorted/);

  assert.throws(function() {
    validateDatSearchLoadsResult({
      ...result,
      offers: [{ ...offer(1, 4500), comments: 'Call 312-555-0199' }],
      directResultCount: 1,
      eligibleCount: 1,
      excludedCount: 0,
      exclusionReasons: {}
    });
  }, /prohibited contact data/);

  assert.throws(function() {
    validateDatSearchLoadsResult({
      ...result,
      offers: [{ ...offer(1, 4500), displayedTotal: '$1,000', totalUsd: 9999 }],
      directResultCount: 1,
      eligibleCount: 1,
      excludedCount: 0,
      exclusionReasons: {}
    });
  }, /ranked offer is invalid/);

  console.log('DAT Search Loads integration contract tests passed.');
}

run();
