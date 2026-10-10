import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateValue, proportionalValue, cents } from '../../lib/inventory-money.js';
test('monetary allocation conserves cents, including final remainder and fractional quantities', () => {
  assert.deepEqual(allocateValue(100, [1, 1, 1]), [33.33, 33.33, 33.34]);
  assert.deepEqual(allocateValue(0.01, [0.001, 0.002, 0.003]), [0, 0, 0.01]);
  for (let amount = 1; amount < 1000; amount += 7) {
    const values = allocateValue(amount / 100, [0.123, 2.456, 7.891]);
    assert.equal(values.reduce((sum, value) => sum + cents(value), 0n), BigInt(amount));
    assert.equal(proportionalValue(amount / 100, 3, 3), amount / 100);
  }
  assert.throws(() => proportionalValue(10, 4, 3), /Invalid/);
});
