import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedOrderType, orderTypeLabel, normalizedOrderTypeSql } from '../../lib/order-types.js';

test('every non-delivery sale, including legacy dine-in rows, normalizes to counter', () => {
  assert.equal(normalizedOrderType({ order_type: 'counter' }), 'counter');
  assert.equal(normalizedOrderType({ order_type: null }), 'counter');
  // Rows written while this was the 99 Shop keep their stored type; they must
  // still group as ordinary counter sales rather than a channel of their own.
  assert.equal(normalizedOrderType({ order_type: 'dine_in', table_id: 4 }), 'counter');
  assert.equal(normalizedOrderType({ order_type: 'takeaway' }), 'counter');
  assert.equal(orderTypeLabel({ order_type: 'counter' }), 'Counter');
  assert.equal(orderTypeLabel({ order_type: 'dine_in' }), 'Counter');
});

test('delivery stays its own channel', () => {
  assert.equal(normalizedOrderType({ order_type: 'delivery' }), 'delivery');
  assert.equal(normalizedOrderType('delivery'), 'delivery');
  assert.equal(orderTypeLabel({ order_type: 'delivery' }), 'Delivery');
});

test('report SQL applies the same counter-or-delivery rule', () => {
  const sql = normalizedOrderTypeSql('o');
  assert.match(sql, /o\.order_type/);
  assert.match(sql, /'delivery'/);
  assert.match(sql, /'counter'/);
});
