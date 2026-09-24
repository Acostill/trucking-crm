import assert from 'assert';
import db from '../db';
import { buildPricingPlan, pricingFingerprint, pricingModeFor } from '../services/quoteRouting';
import { fuelAdjustment, priceFromRule } from '../services/expediteRateTable';
import { buildCarrierRecommendation, isPriceableOption } from '../services/carrierQuoteOptions';
import {
  buildDatRateViewRequest,
  mapDatRateViewResult,
  requestDatRateViewLookup,
  WAITING_FOR_DAT_MESSAGE
} from '../services/datRateViewJobs';
import { carrierRequestFingerprint, haversineMiles } from '../services/laneHistory';

function shipment(overrides: any = {}): any {
  return {
    pickup: { location: { city: 'Atlanta', state: 'GA', zip: '30303' }, date: '2099-01-05' },
    delivery: { location: { city: 'Dallas', state: 'TX', zip: '75201' } },
    pieces: { quantity: 2, parts: [{ count: 2, length: 48, width: 40, height: 48 }] },
    weight: { value: 1200, unit: 'lbs' },
    truckType: 'Cargo Van',
    ...overrides
  };
}

// Truckload: DAT only; no pre-award carrier calls.
const truckload = buildPricingPlan(shipment({ truckType: 'Dry Van', weight: { value: 30000 } }));
assert.strictEqual(truckload.mode, 'truckload');
assert.strictEqual(truckload.queueDat, true);
assert.strictEqual(truckload.callExpediteAll, false);
assert.strictEqual(truckload.callForwardAir, false);

// Expedite with a rate-table entry: ExpediteAll is still asked by default
// (accuracy first), never DAT.
const vanWithTable = buildPricingPlan(shipment(), { hasRateTableRule: true });
assert.strictEqual(vanWithTable.mode, 'expedite');
assert.strictEqual(vanWithTable.useRateTable, true);
assert.strictEqual(vanWithTable.callExpediteAll, true);
assert.strictEqual(vanWithTable.queueDat, false);

// With the setting off, the table alone prices the van before award.
const tableOnly = buildPricingPlan(shipment(), { hasRateTableRule: true, expediteAllBeforeAward: false });
assert.strictEqual(tableOnly.callExpediteAll, false);
// With the setting off but no table rate, ExpediteAll is still the only source.
assert.strictEqual(buildPricingPlan(shipment(), { expediteAllBeforeAward: false }).callExpediteAll, true);

// Expedite without a table entry falls back to ExpediteAll (cargo van only).
assert.strictEqual(buildPricingPlan(shipment()).callExpediteAll, true);
assert.strictEqual(buildPricingPlan(shipment({ truckType: 'Box Truck' })).callExpediteAll, false);
assert.strictEqual(buildPricingPlan(shipment({ weight: { value: 3500 } })).callExpediteAll, false);
assert.strictEqual(pricingModeFor(shipment({ truckType: 'Reefer Straight Truck' })), 'expedite');
assert.strictEqual(pricingModeFor(shipment({ truckType: 'Reefer Dry Van' })), 'truckload');

// LTL rating only with a confirmed freight class.
assert.strictEqual(buildPricingPlan(shipment({ forwardAirFreightClass: '70' })).callForwardAir, true);
assert.strictEqual(buildPricingPlan(shipment({ forwardAirFreightClass: 'abc' })).callForwardAir, false);

// Non-pricing edits keep the same fingerprint; pricing edits change it.
const base = shipment();
assert.strictEqual(pricingFingerprint(base), pricingFingerprint({ ...base, referenceNumber: 'PO 123', staffNote: 'call first' }));
assert.notStrictEqual(pricingFingerprint(base), pricingFingerprint({ ...base, weight: { value: 1300 } }));
assert.notStrictEqual(pricingFingerprint(base), pricingFingerprint({ ...base, truckType: 'Box Truck' }));

// Carrier cache fingerprints ignore the pickup date but not the freight.
assert.strictEqual(
  carrierRequestFingerprint('expediteAll', base),
  carrierRequestFingerprint('expediteAll', { ...base, pickup: { ...base.pickup, date: '2099-02-01' } })
);
assert.notStrictEqual(
  carrierRequestFingerprint('expediteAll', base),
  carrierRequestFingerprint('expediteAll', { ...base, weight: { value: 2000 } })
);

// Rate table: per mile with a minimum, plus an optional base charge.
const rule = { baseCharge: 0, ratePerMile: 1.8, minimumCharge: 250 };
assert.strictEqual(priceFromRule(rule, 800), 1440);
assert.strictEqual(priceFromRule(rule, 50), 250);
assert.strictEqual(priceFromRule({ baseCharge: 328, ratePerMile: 0.57, minimumCharge: 300 }, 700), 727);

// Fuel: miles x diesel change / mpg. 700 mi, +$0.80/gal, 16 mpg = +$35.
const fuelRule: any = { fuelBaselineDiesel: 5.73, milesPerGallon: 16 };
assert.strictEqual(fuelAdjustment(fuelRule, 700, 6.53), 35);
assert.strictEqual(fuelAdjustment({ ...fuelRule, fuelBaselineDiesel: null }, 700, 6.53), 0);

// Atlanta → Dallas is ~720 straight-line miles.
const straight = haversineMiles({ latitude: 33.749, longitude: -84.388 }, { latitude: 32.776, longitude: -96.797 });
assert(straight > 700 && straight < 740, `unexpected distance ${straight}`);

// DAT is not queued for expedite vehicles.
assert.strictEqual(buildDatRateViewRequest('q1', shipment({ datEquipmentType: 'Van' })), null);
assert(buildDatRateViewRequest('q1', shipment({ truckType: 'Dry Van', datEquipmentType: 'Van' })));

// DAT spot is a priceable market estimate; contract stays reference-only.
const card = {
  averageTotalUsd: 2100, lowTotalUsd: 1900, highTotalUsd: 2400, averagePerMileUsd: 2.6,
  miles: 800, timeframe: '15 days', acceptedMarketLane: 'ATL → DAL'
};
const [spot, contract] = mapDatRateViewResult({
  acceptedEquipmentType: 'Van', lookupTimestamp: new Date().toISOString(), spot: card, contract: card
} as any);
assert.strictEqual(isPriceableOption(spot), true);
assert.strictEqual(isPriceableOption(contract), false);

// Recommendation prefers the market estimate over a carrier bid.
const recommendation = buildCarrierRecommendation([
  { key: 'forwardAir', source: 'Forward Air', available: true, cost: 900 },
  spot
], 15);
assert(recommendation);
assert.strictEqual(recommendation!.carrierKey, 'datSpot');
assert.strictEqual(recommendation!.suggestedClientPrice, 2415);

// For expedite, a live ExpediteAll price leads over the rate table.
const vanRecommendation = buildCarrierRecommendation([
  { key: 'rateTable', source: 'First Class rate table', available: true, selectable: true, benchmark: true, cost: 1100 },
  { key: 'expediteAll', source: 'ExpediteAll', available: true, cost: 1250 }
], 15);
assert.strictEqual(vanRecommendation!.carrierKey, 'expediteAll');

// A price staff recorded from a carrier leads over every estimate.
const manualRecommendation = buildCarrierRecommendation([
  { key: 'rateTable', source: 'First Class rate table', available: true, selectable: true, benchmark: true, cost: 1060 },
  { key: 'manualQuote', source: 'Test Carrier (phone)', available: true, cost: 1350 },
  spot
], 10);
assert.strictEqual(manualRecommendation!.carrierKey, 'manualQuote');

// Plain carrier options stay priceable; unavailable ones do not.
assert.strictEqual(isPriceableOption({ key: 'expediteAll', source: 'ExpediteAll', available: true, cost: 400 }), true);
assert.strictEqual(isPriceableOption({ key: 'expediteAll', source: 'ExpediteAll', available: false, cost: 400 }), false);

// A second quote on the same lane reuses a recent RateView result instead of
// spending another DAT search, and becomes ready to price.
async function testRateViewReuse() {
  const truckloadShipment = shipment({ truckType: 'Dry Van', datEquipmentType: 'Van' });
  const candidate = buildDatRateViewRequest('quote-b', truckloadShipment)!;
  const marketCard = function(rateType: string, total: number, timeframe: string) {
    return {
      rateType, acceptedMarketLane: 'Atlanta, GA → Dallas, TX',
      averageTotalUsd: total, averagePerMileUsd: 2.6, lowTotalUsd: total - 200, highTotalUsd: total + 300,
      lowPerMileUsd: 2.35, highPerMileUsd: 2.97, miles: 800, timeframe
    };
  };
  const priorResult = {
    requestId: 'quote-a:x', source: 'DAT RateView', lookupTimestamp: new Date().toISOString(),
    acceptedOrigin: 'Atlanta, GA', acceptedDestination: 'Dallas, TX', acceptedEquipmentType: 'Van',
    spot: marketCard('SPOT', 2100, '7 days'),
    contract: marketCard('CONTRACT', 2250, '90 days')
  };
  const quote: any = {
    id: 'quote-b', status: 'needs_review', processing_error: WAITING_FOR_DAT_MESSAGE,
    shipment_request: truckloadShipment, carrier_quotes: [], recommendation: null
  };
  const inserted: any[] = [];
  const fake = {
    async query(sql: string, params: any[] = []): Promise<any> {
      const statement = sql.replace(/\s+/g, ' ').trim();
      if (statement.startsWith('SELECT * FROM public.email_quote_requests')) return { rows: [quote] };
      if (statement.startsWith('SELECT * FROM public.dat_rateview_jobs')) return { rows: [] };
      if (statement.startsWith('SELECT id, result_payload, completed_at FROM public.dat_rateview_jobs')) {
        assert.strictEqual(params[0], candidate.fingerprint);
        return { rows: [{ id: 'dat-job-a', result_payload: priorResult, completed_at: new Date().toISOString() }] };
      }
      if (statement.startsWith('INSERT INTO public.dat_rateview_jobs')) {
        const job = {
          id: params[0], email_quote_request_id: params[1], request_fingerprint: params[2],
          status: 'completed', input_payload: JSON.parse(params[3]), result_payload: JSON.parse(params[4])
        };
        inserted.push(job);
        return { rows: [job] };
      }
      if (statement.startsWith('UPDATE public.email_quote_requests SET carrier_quotes')) {
        quote.carrier_quotes = JSON.parse(params[1]);
        if (params[2] && quote.status === 'needs_review' && quote.processing_error === params[3]) {
          quote.recommendation = JSON.parse(params[2]);
          quote.status = 'ready';
        }
        return { rows: [quote] };
      }
      throw new Error(`Unhandled fake SQL: ${statement}`);
    }
  };
  const originalEnabled = process.env.DAT_WORKER_ENABLED;
  const originalTransaction = db.transactionWithUser;
  const originalQuery = db.query;
  process.env.DAT_WORKER_ENABLED = 'true';
  (db as any).transactionWithUser = async function(callback: any) { return callback(fake); };
  (db as any).query = async function() { return { rows: [{ margin_pct: 15 }] }; };
  try {
    const updated = await requestDatRateViewLookup('quote-b', null, { automatic: true });
    assert.strictEqual(inserted.length, 1, 'reuse must insert exactly one completed job');
    assert.strictEqual(inserted[0].input_payload.reusedFromJobId, 'dat-job-a');
    assert.strictEqual(updated.status, 'ready');
    assert.strictEqual(updated.recommendation.carrierKey, 'datSpot');
  } finally {
    process.env.DAT_WORKER_ENABLED = originalEnabled;
    (db as any).transactionWithUser = originalTransaction;
    (db as any).query = originalQuery;
  }
}

testRateViewReuse()
  .then(function() { console.log('market-first pricing tests passed'); })
  .catch(function(err) { console.error(err); process.exitCode = 1; })
  .finally(function() { db.pool.end(); });
