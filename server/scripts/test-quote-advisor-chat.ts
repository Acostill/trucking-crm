import assert from 'assert';
import OpenAI from 'openai';
import {
  buildQuoteAdvisorContext,
  extractQuoteAdvisorSources,
  formatQuoteAdvisorAnswer,
  answerQuoteAdvisorQuestion
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
assert.equal(context.freight.declaredPalletCount, 1);
assert.match(context.freight.countMeaning, /pallets/i);
assert.equal(context.pricing.carrierAndMarketOptions[0].derivedRatePerMile, 1.87);
assert.equal(context.equipment.assignedTruckType, 'Cargo Van');
assert.equal(context.equipment.deterministicCapacityRules, undefined);
assert.equal(context.equipment.automaticAssignmentProfiles[1].truckType, 'Box Truck');
assert.equal(context.equipment.automaticAssignmentProfiles[1].automaticAssignmentLimit.maxPallets, 8);
assert.match(context.equipment.automaticAssignmentProfiles[1].meaning, /not a hard carrier/i);
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
  { title: 'Weather', url: 'https://www.weather.gov/example' },
  { title: 'Duplicate', url: 'https://www.transportation.gov/example' }
]);

console.log('Quote advisor chat checks passed.');

async function testResearchContract() {
  const originalCreate = (OpenAI as any).Responses.prototype.create;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalEnabled = process.env.OPENAI_QUOTE_ADVISOR_WEB_SEARCH_ENABLED;
  const originalError = console.error;
  process.env.OPENAI_API_KEY = 'test-key-not-used-for-network';
  process.env.OPENAI_QUOTE_ADVISOR_WEB_SEARCH_ENABLED = 'true';
  let request: any;
  const text = '🚚 **Check the terminal hours.** citeturn0search0';
  const source = { title: 'Official terminal page', url: 'https://www.forwardair.com/locations' };
  const fixture: any = {
    status: 'completed',
    output_text: text,
    output: [
      { type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [source] } },
      { type: 'message', content: [{ type: 'output_text', text, annotations: [{
        type: 'url_citation', ...source,
        start_index: Array.from(text).length - Array.from('citeturn0search0').length,
        end_index: Array.from(text).length
      }] }] }
    ]
  };
  let nextResponse = fixture;
  (OpenAI as any).Responses.prototype.create = async function(body: any) {
    request = body;
    return nextResponse;
  };
  console.error = () => undefined;
  try {
    const result = await answerQuoteAdvisorQuestion({ row: {}, question: 'Check the terminal hours.' });
    assert.strictEqual(request.tool_choice, 'required', 'the model must not skip research');
    assert.strictEqual(request.tools[0].external_web_access, true);
    assert(request.input.includes(new Date().toISOString().slice(0, 10)));
    assert(request.instructions.includes('never hard carrier or vehicle limits'));
    assert(request.instructions.includes('never call a pallet position a piece'));
    assert.strictEqual(result.usedWebSearch, true);
    assert.deepStrictEqual(result.sources, [source]);
    assert(result.answer.includes('[1](<https://www.forwardair.com/locations>)'));
    assert(result.answer.includes('🚚 **Check the terminal hours.**'));
    assert(!result.answer.includes('turn0search0'));

    const sharedMarker = JSON.parse(JSON.stringify(fixture));
    sharedMarker.output[1].content[0].annotations.push({
      ...sharedMarker.output[1].content[0].annotations[0],
      title: 'Weather', url: 'https://www.weather.gov/'
    });
    const formatted = formatQuoteAdvisorAnswer(sharedMarker, extractQuoteAdvisorSources(sharedMarker));
    assert(formatted.includes('[1](<https://www.forwardair.com/locations>)'));
    assert(formatted.includes('[2](<https://www.weather.gov/>)'));

    for (const badResponse of [
      { ...fixture, output: fixture.output.slice(1) },
      { ...fixture, output: [{ type: 'web_search_call', status: 'failed' }, fixture.output[1]] },
      { status: 'completed', output_text: 'Unsupported claim', output: [{ type: 'web_search_call', status: 'completed', action: { sources: [] } }] }
    ]) {
      nextResponse = badResponse;
      await assert.rejects(answerQuoteAdvisorQuestion({ row: {}, question: 'Research this lane.' }), /Web research did not return usable sources/);
    }
    nextResponse = { ...fixture, status: 'incomplete' };
    await assert.rejects(answerQuoteAdvisorQuestion({ row: {}, question: 'Research this lane.' }), /temporarily unavailable/);

    process.env.OPENAI_QUOTE_ADVISOR_WEB_SEARCH_ENABLED = 'false';
    nextResponse = { status: 'completed', output_text: 'Saved cost: $500.', output: [] };
    const offline = await answerQuoteAdvisorQuestion({ row: {}, question: 'What is the saved cost?' });
    assert.strictEqual(request.tools, undefined);
    assert.strictEqual(offline.usedWebSearch, false);
    assert.deepStrictEqual(offline.sources, []);
    assert(offline.answer.startsWith('Web research is unavailable.'));
    console.log('Quote advisor research and citation checks passed.');
  } finally {
    (OpenAI as any).Responses.prototype.create = originalCreate;
    console.error = originalError;
    if (originalKey == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalEnabled == null) delete process.env.OPENAI_QUOTE_ADVISOR_WEB_SEARCH_ENABLED;
    else process.env.OPENAI_QUOTE_ADVISOR_WEB_SEARCH_ENABLED = originalEnabled;
  }
}

testResearchContract().catch(error => { console.error(error); process.exitCode = 1; });
