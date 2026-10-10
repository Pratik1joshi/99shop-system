import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentSummary } from '../../lib/commerce-payment-summary.js';

test('split cash change is measured against the cash allocation, not the full sale', () => {
  assert.deepEqual(paymentSummary(500, [
    { method: 'cash', amount: 200, cash_tendered: 500 },
    { method: 'online', amount: 300 },
  ]), { amountDue: 500, allocated: 500, cashAllocated: 200, cashTendered: 500,
    otherAllocated: 300, remaining: 0, change: 300 });
});

test('partial tender remains due and gives no change', () => {
  const summary = paymentSummary(500, [{ method: 'cash', amount: 100, cash_tendered: 100 }]);
  assert.equal(summary.remaining, 400);
  assert.equal(summary.change, 0);
});
