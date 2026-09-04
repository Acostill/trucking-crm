import assert from 'assert';
import { EventEmitter } from 'events';
import https from 'https';
import {
  callExpediteAllAPI,
  describeExpediteAllError,
  expediteAllEligibilityError,
  prepareExpediteAllRequest
} from '../services/expediteAll';

async function run() {
  const originalBaseUrl = process.env.EXPEDITEALL_BASE_URL;
  const originalApiKey = process.env.EXPEDITEALL_API_KEY;
  const originalRequest = https.request;

  try {
    delete process.env.EXPEDITEALL_BASE_URL;
    delete process.env.EXPEDITEALL_API_KEY;

    const missingConfig = await callExpediteAllAPI({});
    assert.strictEqual(missingConfig.statusCode, 503);
    assert.match((missingConfig.data as any).error, /not configured/i);

    process.env.EXPEDITEALL_BASE_URL = 'https://api.expediteall.com/api/v2';
    process.env.EXPEDITEALL_API_KEY = 'test-api-key';

    let capturedOptions: any;
    let capturedPayload = '';
    (https as any).request = function(options: any, callback: (response: EventEmitter & any) => void) {
      capturedOptions = options;
      const response: EventEmitter & any = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/json; charset=utf-8' };
      callback(response);

      const request: EventEmitter & any = new EventEmitter();
      request.write = function(payload: string) { capturedPayload += payload; };
      request.end = function() {
        process.nextTick(function() {
          response.emit('data', JSON.stringify({ priceTotal: 725, truckType: 'Cargo Van' }));
          response.emit('end');
        });
      };
      return request;
    };

    const result = await callExpediteAllAPI({
      pickup: { date: '2026-09-08' },
      truckType: 'Cargo Van',
      weight: { value: 2500, unit: 'lbs' }
    });
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual((result.data as any).priceTotal, 725);
    assert.strictEqual(capturedOptions.hostname, 'api.expediteall.com');
    assert.strictEqual(capturedOptions.path, '/api/v2/calculate-rate');
    assert.strictEqual(capturedOptions.headers['X-API-Key'], 'test-api-key');

    const parsedPayload = JSON.parse(capturedPayload);
    assert.strictEqual(parsedPayload.shipmentId, '1');
    assert.strictEqual(parsedPayload.referenceNumber, 'Reference12345');
    assert.strictEqual(parsedPayload.pickup.date, '2026-09-08T00:00:00.000Z');

    (https as any).request = function(_options: any, callback: (response: EventEmitter & any) => void) {
      const response: EventEmitter & any = new EventEmitter();
      response.statusCode = 422;
      response.headers = { 'content-type': 'application/json' };
      callback(response);
      const request: EventEmitter & any = new EventEmitter();
      request.write = function() {};
      request.end = function() {
        process.nextTick(function() {
          response.emit('data', JSON.stringify({
            message: 'The weight of the load exceeds the limit.',
            code: 'LOAD_WEIGHT_OVER_LIMIT'
          }));
          response.emit('end');
        });
      };
      return request;
    };
    const overweightCargoVanMessage = describeExpediteAllError({
      truckType: 'Cargo Van',
      weight: { value: 3450, unit: 'lbs' }
    }, {
      message: 'The weight of the load exceeds the limit.',
      code: 'LOAD_WEIGHT_OVER_LIMIT'
    });
    assert.strictEqual(
      overweightCargoVanMessage,
      "Cargo Van exceeds ExpediteAll's 3,000 lb limit; Straight Truck or larger equipment is required."
    );

    assert.strictEqual(expediteAllEligibilityError({
      truckType: 'Box Truck',
      weight: { value: 3450, unit: 'lbs' }
    }), 'ExpediteAll rates Cargo Van shipments only; this load requires Box Truck.');

    const unsupportedStraightTruck = await callExpediteAllAPI({
      truckType: 'Straight Truck',
      weight: { value: 3450, unit: 'lbs' }
    });
    assert.strictEqual(unsupportedStraightTruck.statusCode, 422);
    assert.strictEqual(
      (unsupportedStraightTruck.data as any).error,
      'ExpediteAll rates Cargo Van shipments only; this load requires Straight Truck.'
    );

    const cleaned = prepareExpediteAllRequest({
      hazardousMaterial: { unNumbers: ['', '  '] },
      accessorialCodes: ['', 'NONE']
    });
    assert.strictEqual(cleaned.hazardousMaterial, undefined);
    assert.deepStrictEqual(cleaned.accessorialCodes, ['NONE']);

    capturedPayload = '';
    (https as any).request = function(_options: any, callback: (response: EventEmitter & any) => void) {
      const response: EventEmitter & any = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'text/plain' };
      callback(response);
      const request: EventEmitter & any = new EventEmitter();
      request.write = function() {};
      request.end = function() {
        process.nextTick(function() {
          response.emit('data', JSON.stringify({ priceTotal: 640, truckType: 'Box Truck' }));
          response.emit('end');
        });
      };
      return request;
    };
    const mislabeledJson = await callExpediteAllAPI({
      truckType: 'Cargo Van',
      weight: { value: 2500, unit: 'lbs' }
    });
    assert.strictEqual(mislabeledJson.statusCode, 200);
    assert.strictEqual((mislabeledJson.data as any).priceTotal, 640);

    console.log('ExpediteAll production configuration tests passed.');
  } finally {
    (https as any).request = originalRequest;
    if (originalBaseUrl === undefined) delete process.env.EXPEDITEALL_BASE_URL;
    else process.env.EXPEDITEALL_BASE_URL = originalBaseUrl;
    if (originalApiKey === undefined) delete process.env.EXPEDITEALL_API_KEY;
    else process.env.EXPEDITEALL_API_KEY = originalApiKey;
  }
}

run().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
