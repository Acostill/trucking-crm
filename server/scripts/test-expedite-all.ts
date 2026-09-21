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

    let providerRejection = {
      message: 'The weight of the load exceeds the limit.',
      code: 'LOAD_WEIGHT_OVER_LIMIT'
    };
    (https as any).request = function(_options: any, callback: (response: EventEmitter & any) => void) {
      const response: EventEmitter & any = new EventEmitter();
      response.statusCode = 422;
      response.headers = { 'content-type': 'application/json' };
      callback(response);
      const request: EventEmitter & any = new EventEmitter();
      request.write = function() {};
      request.end = function() {
        process.nextTick(function() {
          response.emit('data', JSON.stringify(providerRejection));
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
    }), "ExpediteAll's connected rating API supports Cargo Van only. This load is assigned to Box Truck; request an ExpediteAll portal/manual quote for that equipment.");

    const unsupportedStraightTruck = await callExpediteAllAPI({
      truckType: 'Straight Truck',
      weight: { value: 3450, unit: 'lbs' }
    });
    assert.strictEqual(unsupportedStraightTruck.statusCode, 422);
    assert.strictEqual(
      (unsupportedStraightTruck.data as any).error,
      "ExpediteAll's connected rating API supports Cargo Van only. This load is assigned to Straight Truck; request an ExpediteAll portal/manual quote for that equipment."
    );

    const dimensionMessage = describeExpediteAllError({ truckType: 'Cargo Van' }, {
      message: 'The size of the load exceeds the dimensions.'
    });
    assert.match(dimensionMessage, /Cargo Van dimension limits/);
    assert.match(dimensionMessage, /does not return Box Truck or Straight Truck rates/);
    assert.match(dimensionMessage, /portal\/manual quote/);
    assert.strictEqual(describeExpediteAllError({}, { message: 'Pickup location not found.' }), 'Pickup location not found.');

    // Staff-selected Cargo Van still reaches the provider; report the API
    // limitation instead of implying that no larger vehicle can carry it.
    providerRejection = { message: 'The size of the load exceeds the dimensions.', code: '' };
    const dimensionRejection = await callExpediteAllAPI({
      truckType: 'Cargo Van',
      truckAssignment: { source: 'staff' },
      pieces: { quantity: 2, unit: 'in', parts: [{ count: 2, length: 107, width: 31, height: 31 }] },
      weight: { value: 130, unit: 'lbs' }
    });
    assert.strictEqual(dimensionRejection.statusCode, 422);
    assert.strictEqual((dimensionRejection.data as any).error, dimensionMessage);
    assert.strictEqual((dimensionRejection.data as any).priceTotal, undefined);

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
          response.emit('data', JSON.stringify({ priceTotal: 640, truckType: 'Cargo Van' }));
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
