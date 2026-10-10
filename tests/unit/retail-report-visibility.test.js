import test from 'node:test';
import assert from 'node:assert/strict';
import { restrictRetailReport } from '../../lib/retail-report-visibility.js';
import { buildRetailReport, retailSupportedFilters } from '../../lib/retail-reporting.js';

test('cashier report response excludes restricted cost and profit in columns, rows, and totals', () => {
  const report = {
    kpis: [{ key: 'net', value: 100 }, { key: 'cogs', value: 60 }, { key: 'profit', value: 40 }],
    tables: [{ columns: [{ key: 'sale_number' }, { key: 'cogs_total' }, { key: 'gross_profit' }], rows: [{ sale_number: 'S-1', cogs_total: 60, gross_profit: 40 }] }],
  };
  const visible = restrictRetailReport(report, 'sales', () => false);
  assert.deepEqual(visible.kpis.map((item) => item.key), ['net']);
  assert.deepEqual(visible.tables[0].columns.map((column) => column.key), ['sale_number']);
  assert.deepEqual(visible.tables[0].rows, [{ sale_number: 'S-1' }]);
  assert.equal(report.tables[0].rows[0].cogs_total, 60, 'source report is not mutated');
});

test('inventory and supplier values require their own cost capabilities', () => {
  const inventory = { tables: [{ columns: [{ key: 'sku' }, { key: 'value' }], rows: [{ sku: 'A', value: 25 }] }] };
  assert.deepEqual(restrictRetailReport(inventory, 'inventory', () => false).tables[0].rows, [{ sku: 'A' }]);
  assert.deepEqual(restrictRetailReport(inventory, 'inventory', (key) => key === 'retail_inventory.view_cost').tables[0].rows, inventory.tables[0].rows);
  const purchases = { kpis: [{ key: 'purchases', value: 25 }], tables: [{ columns: [{ key: 'supplier' }, { key: 'total' }], rows: [{ supplier: 'A', total: 25 }] }] };
  const restricted = restrictRetailReport(purchases, 'purchases', () => false);
  assert.deepEqual(restricted.kpis, []);
  assert.deepEqual(restricted.tables[0].rows, [{ supplier: 'A' }]);
});

test('only sales filters are advertised while other retail reports have period scope only', () => {
  assert.deepEqual(retailSupportedFilters('sales'), ['businessDayId', 'employeeId', 'paymentMethod', 'search']);
  assert.deepEqual(retailSupportedFilters('purchases'), []);
  assert.deepEqual(retailSupportedFilters('inventory'), []);
});

test('business-day sale report does not lose overnight sales to a calendar cutoff', async () => {
  const calls = [];
  const db = { driver: 'sqlite', all: async (sql, params) => { calls.push({ sql, params }); return [{ sale_number: 'S-1' }]; } };
  const report = await buildRetailReport(db, 'sales', { start: '2026-09-28', end: '2026-09-28' }, { businessDayId: 7 });
  assert.match(calls[0].sql, /s\.business_day_id=\?/);
  assert.doesNotMatch(calls[0].sql, /s\.completed_at[<>]=\?/);
  assert.deepEqual(calls[0].params, [7]);
  assert.deepEqual(report.kpis, [], 'unfiltered executive totals must not be presented as filtered totals');
});

test('sales export removes the screen row cap', async () => {
  let sql = '';
  const db = { driver: 'sqlite', all: async (query) => { sql = query; return []; } };
  await buildRetailReport(db, 'sales', { start: '2026-09-28', end: '2026-09-28' }, { businessDayId: 7, exportAll: true });
  assert.doesNotMatch(sql, /LIMIT 1001/);
});

test('expense report excludes voided and source-linked purchase entries', async () => {
  const calls = [];
  const db = { all: async (sql, params) => { calls.push({ sql, params }); return []; } };
  await buildRetailReport(db, 'expenses', { start: '2026-09-01', end: '2026-09-28' });
  assert.match(calls[0].sql, /source_type IS NULL/);
  assert.match(calls[0].sql, /<>\s*'voided'/);
  assert.deepEqual(calls[0].params, ['2026-09-01', '2026-09-28']);
});
