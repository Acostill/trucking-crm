import assert from 'assert';
import { EventEmitter } from 'events';
import https from 'https';
import { callForwardAirAPI, getForwardAirConfig } from '../services/forwardAir';

const names = [
  'FORWARD_AIR_BASE_URL', 'FORWARD_AIR_USERNAME', 'FORWARD_AIR_PASSWORD',
  'FORWARD_AIR_CUSTOMER_ID', 'FORWARD_AIR_BILL_TO_CUSTOMER_NUMBER',
  'FORWARD_AIR_SHIPPER_CUSTOMER_NUMBER'
];

function configure() {
  process.env.FORWARD_AIR_BASE_URL = 'https://api.forwardair.com';
  process.env.FORWARD_AIR_USERNAME = 'production-user';
  process.env.FORWARD_AIR_PASSWORD = 'production-password';
  process.env.FORWARD_AIR_CUSTOMER_ID = 'PRODUCTION-CUSTOMER';
  process.env.FORWARD_AIR_BILL_TO_CUSTOMER_NUMBER = 'BILL-TO';
  process.env.FORWARD_AIR_SHIPPER_CUSTOMER_NUMBER = 'SHIPPER';
}

async function run() {
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalRequest = https.request;
  try {
    names.forEach(name => delete process.env[name]);
    assert.match(getForwardAirConfig().error || '', /not configured/i);
    assert.match((await callForwardAirAPI({})).data.error || '', /not configured/i);

    configure();
    process.env.FORWARD_AIR_BASE_URL = 'https://test-api.forwardair.com';
    assert.match(getForwardAirConfig().error || '', /production/i);
    process.env.FORWARD_AIR_BASE_URL = 'https://api.forwardair.com';
    assert.match((await callForwardAirAPI({
      pickup: { location: { zip: '28208' }, date: '2026-09-09' },
      delivery: { location: { zip: '30320' } },
      pieces: { quantity: 1, parts: [{ length: 48, width: 40, height: 48 }] },
      weight: { value: 500, unit: 'lbs' }
    })).data.error || '', /freight class/i);

    let options: any;
    let payload = '';
    (https as any).request = function(input: any, callback: (response: EventEmitter & any) => void) {
      options = input;
      const response: EventEmitter & any = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/xml' };
      callback(response);
      const request: EventEmitter & any = new EventEmitter();
      request.write = function(value: string) { payload += value; };
      request.end = function() {
        process.nextTick(function() {
          response.emit('data', '<QuoteResponse><QuoteAmount>725.50</QuoteAmount><LineHaul>600</LineHaul></QuoteResponse>');
          response.emit('end');
        });
      };
      return request;
    };
    const response = await callForwardAirAPI({
      pickup: { location: { zip: '28208' }, date: '2026-09-09T17:00:00.000Z' },
      delivery: { location: { zip: '30320' } },
      pieces: { quantity: 2, parts: [{ length: 48, width: 40, height: 48 }] },
      weight: { value: 500, unit: 'lbs' },
      forwardAirFreightClass: '70'
    });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual((response.data as any).QuoteResponse.QuoteAmount, '725.50');
    assert.strictEqual(options.hostname, 'api.forwardair.com');
    assert.strictEqual(options.path, '/ltlservices/v2/rest/waybills/quotes');
    assert.strictEqual(options.headers.user, 'production-user');
    assert.strictEqual(options.headers.customerId, 'PRODUCTION-CUSTOMER');
    assert.match(payload, /<BillToCustomerNumber>BILL-TO<\/BillToCustomerNumber>/);
    assert.match(payload, /<ShipperCustomerNumber>SHIPPER<\/ShipperCustomerNumber>/);
    assert.match(payload, /<FreightClass>70<\/FreightClass>/);
    assert.doesNotMatch(payload, /1234567|2300130|60\.0/);
    console.log('Forward Air production configuration tests passed.');
  } finally {
    (https as any).request = originalRequest;
    names.forEach(name => saved[name] === undefined ? delete process.env[name] : process.env[name] = saved[name]);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
