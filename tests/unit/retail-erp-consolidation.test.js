import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureStandardVariant } from '../../lib/menu-variants.js';
import { requireRetailStaffRole } from '../../lib/employees.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('legacy POS routes converge on the one Billing workspace', () => {
  assert.match(source('app/admin/pos/page.jsx'), /redirect\('\/admin\/billing'\)/);
  assert.match(source('app/admin/retail-pos/page.jsx'), /redirect\('\/admin\/billing'\)/);
  assert.match(source('app/cashier/pos/page.jsx'), /redirect\('\/cashier\/billing'\)/);
  assert.match(source('app/cashier/retail-pos/page.jsx'), /redirect\('\/cashier\/billing'\)/);
});

test('workspace navigation exposes canonical Billing and Purchasing views', () => {
  const nav = source('components/erp/app-shell.jsx');
  assert.match(nav, /name: 'Billing', href: '\/admin\/billing'/);
  assert.match(nav, /name: 'Purchases', href: '\/admin\/retail-goods-receipts'/);
  assert.match(nav, /name: 'Purchase returns', href: '\/admin\/retail-purchase-returns'/);
  assert.doesNotMatch(nav, /name: 'Retail POS'/);
});

test('a standard SKU is updated in place so retail history keeps its foreign key', async () => {
  const calls = [];
  const db = {
    all: async (sql) => sql.startsWith('SELECT *')
      ? (calls.length ? [{ id: 41, menu_item_id: 7, variant_name: 'Standard', price: 125 }] : [{ id: 41, menu_item_id: 7, variant_name: 'Old', price: 99 }])
      : [],
    run: async (sql, params) => { calls.push({ sql, params }); },
  };
  const rows = await ensureStandardVariant(db, 7, { price: 125, stockUnit: 'pcs' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE menu_item_variants/);
  assert.equal(calls[0].params[2], 41);
  assert.equal(rows[0].id, 41);
});

test('collapsing multiple real variants is rejected instead of deleting linked history', async () => {
  const db = {
    all: async () => [{ id: 1 }, { id: 2 }],
    run: async () => assert.fail('must not mutate variants'),
  };
  await assert.rejects(
    () => ensureStandardVariant(db, 7, { price: 99 }),
    /multiple variants/
  );
});

test('Billing opens the whole catalog in the Items browser without a search', () => {
  const billing = source('components/pos/retail-pos.jsx');
  assert.match(billing, /useCommerceSearch\(browserTerm, \{ group: 'products', limit: 60, categoryId, refreshKey: refresh, enabled: itemsOpen \}\)/);
  assert.doesNotMatch(billing, /api\/admin\/products\?channel=pos/);
  assert.doesNotMatch(billing, /!searchTerm \? \(/);
});

test('retail staff access roles exclude 99 Shop-only waiter and kitchen accounts', () => {
  assert.equal(requireRetailStaffRole('cashier'), 'cashier');
  assert.equal(requireRetailStaffRole('ADMIN'), 'admin');
  assert.throws(() => requireRetailStaffRole('waiter'), /99 Shop-only/i);
  assert.throws(() => requireRetailStaffRole('kitchen'), /99 Shop-only/i);
  const staffPage = source('app/admin/employees/page.jsx');
  assert.doesNotMatch(staffPage, /option value="waiter"/);
  assert.doesNotMatch(staffPage, /option value="kitchen"/);
});

test('legacy sale creation endpoints fail closed in Retail mode', () => {
  assert.match(source('app/api/admin/billing/route.js'), /Legacy 99 Shop billing is read-only in Retail mode/);
  assert.match(source('app/api/admin/pos/orders/route.js'), /99 Shop orders cannot be created in Retail mode/);
});

test('active retail dashboard and reporting never read 99 Shop transaction facts', () => {
  for (const file of ['app/api/admin/dashboard/route.js', 'lib/retail-reporting.js']) {
    const text = source(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(text, /\b(?:bills|kots|stock_movements)\b/i, file);
  }
});
