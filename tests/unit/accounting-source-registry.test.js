import test from 'node:test';
import assert from 'node:assert/strict';
import { accountingSource } from '../../lib/accounting-source-registry.js';

test('source resolution distinguishes original reversal journal from reversal record', () => {
  assert.equal(accountingSource({ id: 9, source_type: 'reversal', source_id: 3 }).href, '/admin/retail-journals/3');
  assert.equal(accountingSource({ journal_id: 9, source_type: 'cash_movement', source_id: null }).href, '/admin/retail-journals/9');
  assert.equal(accountingSource({ id: 9, source_type: 'retail_sale', source_id: 3 }).href, '/admin/retail-sales-history/3');
});
test('unknown and invalid source identities never fabricate operational destinations', () => {
  assert.equal(accountingSource({ id: 9, source_type: 'future_type', source_id: 3 }).href, '/admin/retail-journals/9');
  assert.equal(accountingSource({ source_type: 'retail_sale', source_id: '../settings' }).href, null);
  assert.equal(accountingSource({ source_type: '__proto__', source_id: 1 }).href, null);
});
