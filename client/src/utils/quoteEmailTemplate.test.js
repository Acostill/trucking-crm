import { buildQuoteEmailHtml } from './quoteEmailTemplate';

const quote = {
  quoteId: 'quote-email-quote-1788974000000-a2c8d1f0',
  pricedAt: '2026-09-09T15:00:00Z',
  createdAt: '2026-09-08T15:00:00Z',
  selection: { carrierKey: 'forwardAir', clientPrice: 1473.37, carrierCost: 1248.62, marginPct: 18 },
  carrierQuotes: [{ key: 'forwardAir', truckType: 'LTL', transitTime: 2, cost: 1248.62, accessorials: [{ code: 'FUEL', price: 163.25 }] }],
  staffNotes: 'Private procurement notes',
  shipment: {
    pickup: { location: { city: 'Miami', state: 'FL', zip: '33166' }, date: '2026-09-11T00:00:00Z' },
    delivery: { location: { city: 'Atlanta', state: 'GA', zip: '30336' }, date: '2026-09-15' },
    truckType: 'Cargo Van', commodity: 'Medical equipment',
    pieces: { quantity: 3, unit: 'in', parts: [{ count: 1, length: 48, width: 40, height: 48 }, { count: 2, length: 36, width: 24, height: 30 }] },
    weight: { value: 1500, unit: 'lbs' }, stackable: false,
    accessorialCodes: ['LIFTGATE_DELIVERY']
  }
};

function makeEmail(overrides = {}) {
  return buildQuoteEmailHtml({
    quote, validUntil: '2026-09-16', recipientName: 'Maria Ortiz', recipientEmail: 'maria@example.com',
    logoUrl: 'https://crm.example.com/brand/logo.png', ...overrides
  });
}

function read(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const row = label => Array.from(doc.querySelectorAll('tr')).find(tr => tr.children[0] && tr.children[0].textContent === label);
  return { doc, value: label => row(label) ? row(label).children[1].textContent : null };
}

test('identifies the priced quote and preserves the shipment basis, including every dimension group', () => {
  const html = makeEmail();
  const { doc, value } = read(html);
  expect(doc.body.textContent).toContain(quote.quoteId);
  expect(doc.body.textContent).toContain('Sep 9, 2026');
  expect(doc.body.textContent).not.toContain('Sep 8, 2026');
  expect(doc.body.textContent).toContain('Requested: Sep 11, 2026');
  expect(doc.body.textContent).toContain('Sep 16, 2026');
  expect(value('Quoted service')).toBe('LTL');
  expect(value('Requested equipment')).toBe('Cargo Van');
  expect(value('Handling units')).toBe('3');
  expect(value('Total weight')).toBe('1,500 lbs');
  expect(value('Dimensions (L × W × H)')).toContain('1 unit: 48 × 40 × 48 in');
  expect(value('Dimensions (L × W × H)')).toContain('2 units: 36 × 24 × 30 in');
  expect(value('Stackable')).toBe('No');
  expect(value('Requested extra services')).toBe('Liftgate at delivery');
});

test('never treats carrier costs or requested accessorials as confirmed customer inclusions', () => {
  const { doc, value } = read(makeEmail());
  expect(doc.body.textContent).toContain('$1,473.37');
  expect(value('Fuel surcharge')).toBe('Confirm before booking');
  expect(value('Included extra services')).toBe('No extra services confirmed as included');
  for (const internal of ['1248.62', '1,248.62', '163.25', 'marginPct', 'Private procurement notes']) {
    expect(doc.body.textContent).not.toContain(internal);
  }
});

test('uses explicit fuel and service declarations without changing the customer total', () => {
  const included = read(makeEmail({ fuelSurcharge: 'included', includedServices: 'Liftgate at delivery' }));
  expect(included.value('Fuel surcharge')).toBe('Included in quoted total');
  expect(included.value('Included extra services')).toBe('Liftgate at delivery');
  expect(included.doc.body.textContent).toContain('$1,473.37');
  expect(read(makeEmail({ fuelSurcharge: 'excluded' })).value('Fuel surcharge')).toBe('Not included; quoted separately');
  expect(read(makeEmail({ fuelSurcharge: 'unexpected' })).value('Fuel surcharge')).toBe('Confirm before booking');
});

test('shows classification only for LTL and never computes it from density', () => {
  expect(read(makeEmail()).value('Freight class / NMFC')).toBe('Confirm classification before booking');
  const classified = { ...quote, shipment: { ...quote.shipment, freightClass: 92.5, nmfc: '12345-02' } };
  expect(read(makeEmail({ quote: classified })).value('Freight class / NMFC')).toBe('Class 92.5 · NMFC 12345-02');
  const truckload = { ...classified, carrierQuotes: [{ key: 'forwardAir', truckType: 'Dry Van' }] };
  expect(read(makeEmail({ quote: truckload })).value('Freight class / NMFC')).toBeNull();
});

test('keeps missing and partial information explicit instead of inventing dates, units or service promises', () => {
  const { doc, value } = read(makeEmail({ quote: { shipment: { pieces: { parts: [{ length: 48, height: 30 }] } } }, validUntil: '2026-02-30' }));
  expect(doc.body.textContent).toContain('Reference pending');
  expect(doc.body.textContent).toContain('Date pending');
  expect(value('Dimensions (L × W × H)')).toBe('48 × ? × 30 (unit to be confirmed)');
  expect(value('Total weight')).toBe('To be confirmed');
  expect(doc.body.textContent).not.toMatch(/Invalid Date|NaN|undefined|7 days from issue|Mar 2, 2026/);
  expect(doc.body.textContent).toContain('This quote does not reserve equipment.');
});

test('preserves zero-degree temperature ranges and declared hazardous material details', () => {
  const shipment = { ...quote.shipment, temperatureControlled: true, temperatureControl: { minC: 0, maxC: 4 }, hazardousMaterial: { unNumbers: ['UN1230'] } };
  const result = read(makeEmail({ quote: { ...quote, shipment } }));
  expect(result.value('Temperature control')).toBe('0 to 4 °C');
  expect(result.value('Hazardous material')).toBe('UN1230 · Confirm handling');
});

test('escapes customer-facing fields and retains a usable branded email without scripts', () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const { doc, value } = read(makeEmail({ note: malicious, recipientName: '<b>Maria</b>', includedServices: malicious }));
  expect(doc.body.textContent).toContain(malicious);
  expect(value('Included extra services')).toBe(malicious);
  expect(doc.querySelectorAll('img')).toHaveLength(1);
  expect(doc.querySelector('img').getAttribute('src')).toBe('https://crm.example.com/brand/logo.png');
  expect(doc.querySelectorAll('script, [onerror]')).toHaveLength(0);
});
