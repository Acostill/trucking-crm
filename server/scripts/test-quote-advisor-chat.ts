import assert from 'assert';
import {
  buildQuoteAdvisorContext,
  extractQuoteAdvisorSources
} from '../services/quoteAdvisorChat';

const context: any = buildQuoteAdvisorContext({
  id: 'quote-test',
  subject: 'Test lane',
  status: 'ready',
  quote_id: 'FCT-1048',
  quote_valid_until: '2026-09-16',
  staff_notes: 'Customer needs liftgate delivery. Confirm with carrier.',
  raw_text: 'Please quote this shipment.',
  shipment_request: {
    pickup: { location: { city: 'Miami', state: 'FL', zip: '33166' } },
    delivery: { location: { city: 'Atlanta', state: 'GA', zip: '30336' } },
    pieces: { quantity: 1, unit: 'in', parts: [{ count: 1, length: 48, width: 40, height: 48 }] },
    weight: { value: 500, unit: 'lbs' },
    truckType: 'Cargo Van',
    datEquipmentType: 'Van'
  },
  carrier_quotes: [
    { key: 'forwardAir', source: 'Forward Air', available: true, cost: 1248.62 },
    { key: 'datSpot', source: 'DAT Spot Market', available: true, benchmark: true, cost: 1285, miles: 669, ratePerMile: 1.92 }
  ]
});

assert.equal(context.freight.calculatedVolumeCubicFeet, 53.33);
assert.equal(context.freight.calculatedFootprintSquareFeet, 13.33);
assert.equal(context.freight.calculatedDensityLbPerCubicFoot, 9.38);
assert.equal(context.pricing.carrierAndMarketOptions[0].derivedRatePerMile, 1.87);
assert.equal(context.equipment.assignedTruckType, 'Cargo Van');
assert.equal(context.quote.reference, 'FCT-1048');
assert.equal(context.quote.validUntil, '2026-09-16');
assert.equal(context.quote.staffNotes, 'Customer needs liftgate delivery. Confirm with carrier.');

const sources = extractQuoteAdvisorSources({
  output: [
    {
      type: 'web_search_call',
      action: { sources: [{ title: 'DOT guidance', url: 'https://www.transportation.gov/example' }] }
    },
    {
      type: 'message',
      content: [{
        annotations: [
          { type: 'url_citation', title: 'Weather', url: 'https://www.weather.gov/example' },
          { type: 'url_citation', title: 'Duplicate', url: 'https://www.transportation.gov/example' },
          { type: 'url_citation', title: 'Unsafe', url: 'javascript:alert(1)' }
        ]
      }]
    }
  ]
});

assert.deepEqual(sources, [
  { title: 'DOT guidance', url: 'https://www.transportation.gov/example' },
  { title: 'Weather', url: 'https://www.weather.gov/example' }
]);

console.log('Quote advisor chat checks passed.');
