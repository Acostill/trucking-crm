import assert from 'assert';
import { parsedEmailToShipmentRequest } from '../services/emailQuoteWorkflow';
import {
  dimensionToInches,
  forwardAirTerminalCode,
  normalizeAirportLocation,
  weightToPounds
} from '../services/shipmentNormalization';

function run() {
  assert.strictEqual(dimensionToInches(1200, 'mm'), 47.24);
  assert.strictEqual(dimensionToInches(120, 'cm'), 47.24);
  assert.strictEqual(weightToPounds(1000, 'kg'), 2204.62);
  assert.deepStrictEqual(normalizeAirportLocation({ location_code: 'LAX' }), {
    city: 'Los Angeles', state: 'CA', zip: '90045', country: 'US'
  });
  assert.strictEqual(forwardAirTerminalCode({ city: 'Charlotte', state: 'NC', zip: '28273' }), 'CLT');
  assert.strictEqual(forwardAirTerminalCode({ city: 'Atlanta', state: 'GA', zip: '30320' }), 'ATL');
  assert.strictEqual(forwardAirTerminalCode({ city: 'Dallas', state: 'TX', zip: '75201' }), undefined);

  const shipment = parsedEmailToShipmentRequest({
    parsedSample: {
      subject: 'Metric airport shipment',
      body: {
        shipment_details: {
          pickup: { location_code: 'MIA', pickup_date: '2026-09-08' },
          delivery_options: [{ location_code: 'LAX' }],
          shipment_info: {
            pallets: 2,
            dimensions: [{ length: 1200, width: 1000, height: 1300, unit: 'mm', count: 2 }],
            total_weight: 1000,
            weight_unit: 'kg',
            commodity: 'Machinery',
            stackable: false
          }
        }
      }
    }
  });
  assert.strictEqual(shipment.pickup?.location?.city, 'Miami');
  assert.strictEqual(shipment.delivery?.location?.city, 'Los Angeles');
  assert.strictEqual(shipment.weight?.value, 2204.62);
  assert.strictEqual(shipment.pieces?.parts?.[0].length, 47.24);
  assert.strictEqual(shipment.truckType, 'Dry Van');

  console.log('Shipment normalization tests passed.');
}

run();
