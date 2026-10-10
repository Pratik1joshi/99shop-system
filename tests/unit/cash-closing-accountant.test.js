import test from 'node:test';
import assert from 'node:assert/strict';
import { cashClosingPolicy, guardReconciliationRead, setCashClosingConfig } from '../../lib/cash-closing-policy.js';

test('Accountant can trace posted finance before the cashier cash reveal cutoff', () => {
  setCashClosingConfig({ enabled: true, cutoff: '20:30' });
  const beforeCutoff = new Date('2026-09-25T04:15:00Z'); // 10:00 in Nepal
  assert.equal(cashClosingPolicy({ role: 'accountant' }, beforeCutoff).expectedCashVisible, true);
  assert.equal(cashClosingPolicy({ role: 'cashier' }, beforeCutoff).expectedCashVisible, false);
  assert.doesNotThrow(() => guardReconciliationRead({ method: 'GET', url: 'http://localhost/api/admin/ledger?view=journal' }, { role: 'accountant' }));
});
