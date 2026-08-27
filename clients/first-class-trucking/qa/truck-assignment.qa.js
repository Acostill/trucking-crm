const assert = require('assert');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const assignmentPath = path.join(repositoryRoot, 'server/services/truckAssignment.ts');
const { assignTruckType, TRUCK_ASSIGNMENT_RULE_VERSION } = require(assignmentPath);

let passed = 0;
const failures = [];
const pending = [];

function runCase(name, test) {
  try {
    const result = test();
    if (result && typeof result.then === 'function') {
      pending.push(result.then(
        () => { passed += 1; },
        (error) => {
          failures.push({ name, message: error && error.message ? error.message : String(error) });
        }
      ));
    } else {
      passed += 1;
    }
  } catch (error) {
    failures.push({ name, message: error && error.message ? error.message : String(error) });
  }
}

function shipment({
  pallets = 1,
  weight = 500,
  dimensions = [{ length: 48, width: 40, height: 48, count: pallets }],
  piecesUnit = 'in',
  weightUnit = 'lbs',
  ...extra
} = {}) {
  return {
    pieces: { quantity: pallets, unit: piecesUnit, parts: dimensions },
    weight: { value: weight, unit: weightUnit },
    ...extra
  };
}

function expectAssigned(input, truckType, datEquipmentType) {
  const result = assignTruckType(input);
  assert.strictEqual(result.status, 'assigned');
  assert.strictEqual(result.shipment.truckType, truckType);
  assert.strictEqual(result.shipment.datEquipmentType, datEquipmentType);
  assert.strictEqual(result.metadata.ruleVersion, TRUCK_ASSIGNMENT_RULE_VERSION);
  return result;
}

function expectReview(input, reasonCode) {
  const result = assignTruckType(input);
  assert.strictEqual(result.status, 'needs_review');
  assert.strictEqual(result.metadata.reasonCode, reasonCode);
  assert.strictEqual(result.shipment.truckType, undefined);
  assert.strictEqual(result.shipment.datEquipmentType, undefined);
  return result;
}

[
  ['cargo lower bound', shipment(), 'Cargo Van', 'Van'],
  ['cargo inclusive capacity', shipment({ pallets: 3, weight: 3000, dimensions: [{ length: 72, width: 52, height: 70, count: 3 }] }), 'Cargo Van', 'Van'],
  ['pallet promotion to box', shipment({ pallets: 4, weight: 3000 }), 'Box Truck', 'Van'],
  ['weight promotion to box', shipment({ pallets: 3, weight: 3001 }), 'Box Truck', 'Van'],
  ['dimension promotion to box', shipment({ pallets: 2, weight: 2000, dimensions: [{ length: 73, width: 53, height: 71, count: 2 }] }), 'Box Truck', 'Van'],
  ['box inclusive capacity', shipment({ pallets: 6, weight: 6000, dimensions: [{ length: 96, width: 96, height: 96, count: 6 }] }), 'Box Truck', 'Van'],
  ['pallet promotion to straight', shipment({ pallets: 7, weight: 6000 }), 'Straight Truck', 'Van'],
  ['weight promotion to straight', shipment({ pallets: 6, weight: 6001 }), 'Straight Truck', 'Van'],
  ['dimension promotion to straight', shipment({ pallets: 4, weight: 4000, dimensions: [{ length: 97, width: 97, height: 97, count: 4 }] }), 'Straight Truck', 'Van'],
  ['straight inclusive capacity', shipment({ pallets: 14, weight: 8000, dimensions: [{ length: 120, width: 102, height: 110, count: 14 }] }), 'Straight Truck', 'Van']
].forEach(([name, input, truckType, equipment]) => {
  runCase(name, () => expectAssigned(input, truckType, equipment));
});

runCase('multiple dimension groups promote on any non-fit', () => {
  expectAssigned(shipment({
    pallets: 2,
    weight: 2000,
    dimensions: [
      { length: 48, width: 40, height: 48, count: 1 },
      { length: 80, width: 40, height: 48, count: 1 }
    ]
  }), 'Box Truck', 'Van');
});

[
  ['pallet out of range', shipment({ pallets: 15, weight: 7000 }), 'CAPACITY_OUT_OF_RANGE'],
  ['weight out of range', shipment({ pallets: 10, weight: 8001 }), 'CAPACITY_OUT_OF_RANGE'],
  ['length oversize', shipment({ dimensions: [{ length: 121, width: 40, height: 48, count: 1 }] }), 'OVERSIZED_ENCLOSED_FREIGHT'],
  ['width oversize', shipment({ dimensions: [{ length: 48, width: 103, height: 48, count: 1 }] }), 'OVERSIZED_ENCLOSED_FREIGHT'],
  ['height oversize', shipment({ dimensions: [{ length: 48, width: 40, height: 111, count: 1 }] }), 'OVERSIZED_ENCLOSED_FREIGHT'],
  ['empty shipment', {}, 'MISSING_REQUIRED_FREIGHT_DATA'],
  ['zero pallets', shipment({ pallets: 0 }), 'MISSING_REQUIRED_FREIGHT_DATA'],
  ['fractional pallets', shipment({ pallets: 1.5 }), 'MISSING_REQUIRED_FREIGHT_DATA'],
  ['zero weight', shipment({ weight: 0 }), 'MISSING_REQUIRED_FREIGHT_DATA'],
  ['missing dimensions', shipment({ dimensions: [] }), 'MISSING_REQUIRED_FREIGHT_DATA'],
  ['zero dimension count', shipment({ dimensions: [{ length: 48, width: 40, height: 48, count: 0 }] }), 'MISSING_REQUIRED_FREIGHT_DATA'],
  ['fractional dimension count', shipment({ dimensions: [{ length: 48, width: 40, height: 48, count: 1.5 }] }), 'MISSING_REQUIRED_FREIGHT_DATA']
].forEach(([name, input, reason]) => {
  runCase(name, () => expectReview(input, reason));
});

runCase('complete reefer range maps cargo and DAT Reefer', () => {
  const result = expectAssigned(shipment({ temperatureControl: { minC: 2, maxC: 8 } }), 'Reefer Cargo Van', 'Reefer');
  assert.strictEqual(result.metadata.serviceCategory, 'reefer');
  assert.strictEqual(result.shipment.temperatureControlled, true);
});

runCase('complete reefer range maps box and DAT Reefer', () => {
  expectAssigned(shipment({ pallets: 4, weight: 4000, temperatureControl: { minC: -10, maxC: 0 } }), 'Reefer Box Truck', 'Reefer');
});

runCase('complete reefer range maps straight and DAT Reefer', () => {
  expectAssigned(shipment({ pallets: 10, weight: 7000, temperatureControl: { minC: 0, maxC: 0 } }), 'Reefer Straight Truck', 'Reefer');
});

runCase('partial temperature control requires review', () => {
  expectReview(shipment({ temperatureControl: { minC: 2 } }), 'TEMPERATURE_CONTROL_INCOMPLETE');
});

runCase('reversed temperature range requires review', () => {
  expectReview(shipment({ temperatureControl: { minC: 8, maxC: 2 } }), 'TEMPERATURE_CONTROL_INCOMPLETE');
});

runCase('temperature conflict requires review', () => {
  expectReview(shipment({ temperatureControlled: false, temperatureControl: { minC: 2, maxC: 8 } }), 'TEMPERATURE_CONTROL_CONFLICT');
});

runCase('staff override is preserved and maps DAT Van', () => {
  const input = shipment({
    pallets: 1,
    weight: 500,
    truckType: 'Straight Truck',
    truckAssignment: {
      status: 'assigned',
      source: 'staff',
      ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
      reason: 'Truck type confirmed by staff.'
    }
  });
  const result = expectAssigned(input, 'Straight Truck', 'Van');
  assert.strictEqual(result.metadata.source, 'staff');
});

runCase('staff reefer override is preserved and maps DAT Reefer', () => {
  const input = shipment({
    truckType: 'Reefer Box Truck',
    truckAssignment: {
      status: 'assigned',
      source: 'staff',
      ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
      reason: 'Truck type confirmed by staff.'
    }
  });
  const result = expectAssigned(input, 'Reefer Box Truck', 'Reefer');
  assert.strictEqual(result.metadata.source, 'staff');
});

runCase('unchanged automatic rerun is deterministic', () => {
  const first = assignTruckType(shipment({ pallets: 4, weight: 4000 }));
  const second = assignTruckType(first.shipment);
  assert.deepStrictEqual(second, first);
});

runCase('needs-review rerun is deterministic', () => {
  const first = assignTruckType(shipment({ pallets: 15, weight: 7000 }));
  const second = assignTruckType(first.shipment);
  assert.deepStrictEqual(second, first);
});

runCase('unsupported measurement units fail closed', () => {
  const result = assignTruckType(shipment({ piecesUnit: 'cm', weightUnit: 'kg' }));
  assert.strictEqual(result.status, 'needs_review');
  assert.strictEqual(result.shipment.truckType, undefined);
  assert.strictEqual(result.shipment.datEquipmentType, undefined);
});

runCase('empty temperature bounds fail closed', () => {
  expectReview(shipment({ temperatureControl: { minC: '', maxC: '' } }), 'TEMPERATURE_CONTROL_INCOMPLETE');
});

function installMock(resolvedPath, exportsValue) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: exportsValue,
    children: [],
    paths: []
  };
}

runCase('needs_review performs no carrier or DAT rate calls', async () => {
  const serverRoot = path.join(repositoryRoot, 'server');
  const dbPath = require.resolve(path.join(serverRoot, 'db'));
  const routesPath = require.resolve(path.join(serverRoot, 'routes/index.ts'));
  const unifiedPath = require.resolve(path.join(serverRoot, 'services/unifiedQuoteService.ts'));
  const datPath = require.resolve(path.join(serverRoot, 'services/datRateViewJobs.ts'));
  const workflowPath = require.resolve(path.join(serverRoot, 'services/emailQuoteWorkflow.ts'));
  let connectedCarrierCalls = 0;
  let datCalls = 0;
  const queries = [];
  const mockDb = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (/^\s*SELECT id, shipment_request/.test(sql)) {
        return { rows: [{ id: 'qa-review-only', shipment_request: shipment({ pallets: 15, weight: 7000 }) }] };
      }
      return { rows: [{ id: 'qa-review-only', status: 'needs_review' }] };
    }
  };

  installMock(dbPath, { __esModule: true, default: mockDb });
  installMock(routesPath, { parseEmailWithOpenRouter: async () => ({}) });
  installMock(unifiedPath, {
    getUnifiedQuotes: async () => { connectedCarrierCalls += 1; return {}; },
    getDefaultProfitMarginPct: async () => 0
  });
  installMock(datPath, {
    prepareDatRateViewOptions: async () => { datCalls += 1; return []; }
  });
  delete require.cache[workflowPath];
  const { rateEmailQuoteRequest } = require(workflowPath);
  const result = await rateEmailQuoteRequest('qa-review-only');
  assert.strictEqual(result.status, 'needs_review');
  assert.strictEqual(connectedCarrierCalls, 0);
  assert.strictEqual(datCalls, 0);
  assert.strictEqual(queries.length, 2);
  assert.match(queries[1].sql, /carrier_quotes = '\[\]'::jsonb/);
});

async function main() {
  await Promise.all(pending);
  console.log(JSON.stringify({
    ruleVersion: TRUCK_ASSIGNMENT_RULE_VERSION,
    passed,
    failed: failures.length,
    failures
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
