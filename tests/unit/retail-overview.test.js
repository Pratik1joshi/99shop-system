import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverviewAttention, overviewForRole, OVERVIEW_METRICS } from '../../lib/retail-overview.js';

test('overview metrics have definitions and source workspaces', () => {
  for (const metric of Object.values(OVERVIEW_METRICS)) {
    assert.ok(metric.label && metric.scope && metric.definition);
    assert.match(metric.href, /^\/admin\//);
  }
  assert.match(OVERVIEW_METRICS.cashBalance.definition, /position, not today’s takings/);
});

test('attention groups issues by source class without inventing deadlines', () => {
  const items = buildOverviewAttention({
    lowStock: [{ variantId: 1 }, { variantId: 2 }], outOfStock: [{ variantId: 3 }],
    overdue: { count: 4, amount: 500 }, day: { isStale: true, staleAcknowledged: false },
    reconciliation: { reconciled: false },
  });
  assert.deepEqual(items.map((item) => item.type), [
    'reconciliation', 'stale_register', 'overdue_receivables', 'out_of_stock', 'low_stock',
  ]);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.ok(items.every((item) => item.href && item.status === 'open' && !('dueTime' in item)));
});

test('acknowledged stale register and healthy control produce no attention', () => {
  assert.deepEqual(buildOverviewAttention({ day: { isStale: true, staleAcknowledged: true }, reconciliation: { reconciled: true } }), []);
});

test('manager policy hides cash before reveal and sends drills to authorized workspaces', () => {
  const overview = {
    metrics: [{ key: 'cashBalance', value: 300 }, { key: 'payables', href: '/admin/accounts-payable' }],
    attention: [{ type: 'reconciliation', href: '/admin/retail-reconciliation' }, { type: 'low_stock', href: '/admin/retail-replenishment' }],
    reconciliation: { href: '/admin/retail-reconciliation' },
  };
  const shaped = overviewForRole(overview, 'manager', false);
  assert.equal(shaped.metrics[0].value, null);
  assert.equal(shaped.metrics[1].href, '/admin/retail-finance');
  assert.equal(shaped.attention[0].href, '/admin/retail-finance');
  assert.equal(shaped.attention[1].href, '/admin/retail-inventory?state=LOW');
  assert.equal(shaped.reconciliation.href, '/admin/retail-finance');
});
