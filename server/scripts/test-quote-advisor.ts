import assert from 'assert';
import { buildQuoteAdvisor } from '../services/quoteAdvisor';

function run() {
  const ready = buildQuoteAdvisor({
    truckType: 'Cargo Van',
    truckAssignment: { status: 'assigned', reason: 'Capacity rules passed.' }
  }, [
    { key: 'forwardAir', available: true, selectable: true, cost: 500 },
    { key: 'datSpot', available: true, averageRatePerMile: 2.4 }
  ]);
  assert.strictEqual(ready.reviewRequired, false);
  assert.ok(ready.checks.some(function(check) { return check.label === 'DAT market check'; }));

  const dangerousGoods = buildQuoteAdvisor({
    truckType: 'Dry Van',
    truckAssignment: { status: 'assigned' },
    hazardousMaterial: { unNumbers: ['UN0012'] }
  }, [{ key: 'expediteAll', available: true, selectable: true, cost: 950 }]);
  assert.strictEqual(dangerousGoods.reviewRequired, true);
  assert.ok(dangerousGoods.checks.some(function(check) { return check.label === 'Dangerous goods'; }));

  console.log('Quote advisor tests passed.');
}

run();
