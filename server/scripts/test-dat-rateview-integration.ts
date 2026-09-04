import assert from 'assert';
import {
  buildCarrierRecommendation,
  CarrierQuoteOption
} from '../services/carrierQuoteOptions';
import {
  buildDatRateViewRequest,
  mapDatRateViewResult,
  normalizeDatEquipment,
  validateDatRateViewResult
} from '../services/datRateViewJobs';

function run() {
  assert.strictEqual(normalizeDatEquipment({ datEquipmentType: 'Van' }), 'Van');
  assert.strictEqual(normalizeDatEquipment({ truckType: '53 ft dry van' }), 'Van');
  assert.strictEqual(normalizeDatEquipment({ truckType: 'LTL' }), null);

  const candidate = buildDatRateViewRequest('email-quote-test', {
    pickup: { location: { city: 'Portland', state: 'OR' } },
    delivery: { location: { city: 'Chicago', state: 'IL' } },
    datEquipmentType: 'Van'
  });
  assert(candidate);
  assert.strictEqual(candidate.request.origin, 'Portland, OR');
  assert.strictEqual(candidate.request.destination, 'Chicago, IL');

  const result = validateDatRateViewResult({
    requestId: candidate.request.requestId,
    source: 'DAT RateView',
    lookupTimestamp: '2026-08-11T12:00:00.000Z',
    acceptedOrigin: 'Portland, OR',
    acceptedDestination: 'Chicago, IL',
    acceptedEquipmentType: 'Van',
    spot: {
      rateType: 'SPOT',
      acceptedMarketLane: 'Portland, OR → Chicago, IL',
      averageTotalUsd: 3729,
      averagePerMileUsd: 1.75,
      lowTotalUsd: 3197,
      highTotalUsd: 4092,
      lowPerMileUsd: 1.5,
      highPerMileUsd: 1.92,
      miles: 2131,
      timeframe: '7 days'
    },
    contract: {
      rateType: 'CONTRACT',
      acceptedMarketLane: 'Portland, OR → Chicago, IL',
      averageTotalUsd: 3836,
      averagePerMileUsd: 1.8,
      lowTotalUsd: 3367,
      highTotalUsd: 4539,
      lowPerMileUsd: 1.58,
      highPerMileUsd: 2.13,
      miles: 2131,
      timeframe: '90 days'
    }
  });
  const datOptions = mapDatRateViewResult(result);
  assert.strictEqual(datOptions.length, 2);
  assert.strictEqual(datOptions[0].selectable, false);
  assert.strictEqual(datOptions[0].marketLow, 3197);

  const unavailableRange = validateDatRateViewResult({
    ...result,
    spot: {
      ...result.spot,
      lowTotalUsd: null,
      highTotalUsd: null,
      lowPerMileUsd: null,
      highPerMileUsd: null,
      rangeUnavailableReason: 'DAT explicitly displayed the market range as unavailable'
    }
  });
  const unavailableOption = mapDatRateViewResult(unavailableRange)[0];
  assert.strictEqual(unavailableOption.available, true);
  assert.strictEqual(unavailableOption.marketLow, undefined);
  assert.match(unavailableOption.marketRangeUnavailableReason || '', /unavailable/);

  const unavailableAveragePerMile = validateDatRateViewResult({
    ...result,
    spot: {
      ...result.spot,
      averagePerMileUsd: null,
      averagePerMileUnavailableReason: 'DAT explicitly displayed the average per-mile rate as unavailable'
    }
  });
  const unavailableAverageOption = mapDatRateViewResult(unavailableAveragePerMile)[0];
  assert.strictEqual(unavailableAverageOption.available, true);
  assert.strictEqual(unavailableAverageOption.ratePerMile, undefined);

  assert.throws(function() {
    validateDatRateViewResult({
      ...result,
      spot: {
        ...result.spot,
        lowTotalUsd: null,
        highTotalUsd: null,
        lowPerMileUsd: null,
        highPerMileUsd: null,
        rangeUnavailableReason: null
      }
    });
  }, /reason is missing/);

  const options: CarrierQuoteOption[] = [
    {
      key: 'forwardAir',
      source: 'Forward Air',
      available: true,
      cost: 4100
    },
    ...datOptions
  ];
  const recommendation = buildCarrierRecommendation(options, 18);
  assert(recommendation);
  assert.strictEqual(recommendation.carrierKey, 'forwardAir');
  assert.strictEqual(recommendation.carrierCost, 4100);

  console.log('DAT RateView integration contract tests passed.');
}

run();
