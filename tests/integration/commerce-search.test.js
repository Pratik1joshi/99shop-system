import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../lib/db/index.js';
import { searchCommerce } from '../../lib/commerce-search.js';
import { quoteRetailSale, holdSale, checkoutSale, listRetailSales } from '../../lib/retail-sales.js';
import { openBusinessDay } from '../../lib/business-days.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { receiveStock, getDefaultLocation } from '../../lib/retail-inventory.js';
import { queryRetailMovements } from '../../lib/retail-movement-query.js';

const db = Database.getInstance();
const can = () => true;
let variantId;
test.after(async () => db.close());
test('seed 10,000 products and alternate barcodes through catalog schema', async () => {
  await db.run("INSERT INTO product_categories(name) VALUES ('Commerce fixtures')");
  await db.run(`INSERT INTO products(name,base_price,is_available,category_id) SELECT 'Commerce Product ' || n,100,1,(SELECT id FROM product_categories ORDER BY id LIMIT 1) FROM generate_series(1,10000) AS n`);
  await db.run(`INSERT INTO product_variants(product_id,variant_name,price,is_default,sku,barcode,tracking_mode)
    SELECT id,'Standard',100,1,'COM-' || id,'99COM' || id,'none' FROM products WHERE name LIKE 'Commerce Product %'`);
  const v = await db.get("SELECT id,product_id FROM product_variants WHERE sku LIKE 'COM-%' ORDER BY id LIMIT 1");
  variantId = v.id;
  await db.run('INSERT INTO product_barcodes(variant_id,barcode) VALUES (?,?)', [variantId,'EXACT-ALT-100']);
});
test('unauthorized search issues no entity queries and returns no sensitive results', async () => {
  const result = await searchCommerce({ all() { throw new Error('unauthorized query'); } }, { query: 'Commerce', can: () => false });
  assert.deepEqual(result.groups, []);
});
test('alternate exact barcode resolves first, with bounded result and no cost', async () => {
  const start = performance.now();
  const result = await searchCommerce(db, { query: 'EXACT-ALT-100', group: 'products', can });
  const row = result.groups[0].results[0];
  assert.equal(Number(row.id), Number(variantId));
  assert.equal(Number(row.exact_match), 1);
  assert.equal('cost' in row, false);
  assert.equal('unit_cost' in row, false);
  console.log(`COMMERCE_PERF exact barcode 10k: ${(performance.now() - start).toFixed(2)}ms`);
});
test('text search and continuation are bounded, stable and SQL-injection safe', async () => {
  const start = performance.now();
  const first = await searchCommerce(db, { query: 'Commerce Product', group: 'products', limit: 40, can });
  const second = await searchCommerce(db, { query: 'Commerce Product', group: 'products', limit: 40, page: 2, can });
  assert.equal(first.groups[0].results.length, 40);
  assert.equal(first.groups[0].has_more, true);
  const ids = new Set(first.groups[0].results.map((r) => r.id));
  assert.ok(second.groups[0].results.every((r) => !ids.has(r.id)));
  const injected = await searchCommerce(db, { query: "' OR 1=1 --", group: 'products', can });
  assert.equal(injected.groups[0].results.length, 0);
  console.log(`COMMERCE_PERF text two pages 10k: ${(performance.now() - start).toFixed(2)}ms`);
});
test('customer phone exactness and permission filtering', async () => {
  await db.run("INSERT INTO customers(name,phone,phone_digits,notes) VALUES ('Commerce Customer','9801234501','9801234501','PRIVATE CRM NOTE')");
  const result = await searchCommerce(db, { query: '9801234501', can: (key) => key === 'customers.access' });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].results[0].exact_match, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE CRM'), false);
});
test('server quote matches posted VAT, payment retry posts one economic sale', async () => {
  const day = await openBusinessDay(db, { businessDate: getNepaliDateString(), openingCash: 0, user: { id: 1, role: 'admin' } });
  const location = await getDefaultLocation(db);
  await receiveStock(db, { variantId, locationId: location.id, quantity: 10, unitCost: 30, movementType: 'OPENING_STOCK', referenceType: 'commerce_test', referenceId: 1, businessDayId: day.id });
  const lines = [{ variant_id: variantId, quantity: 2 }];
  const quote = await quoteRetailSale(db, { lines, discount_amount: 10 }, { allowDiscount: true });
  const held = await holdSale(db, { lines, cashierId: 1 });
  const opts = { lines, discountAmount: 10, allowDiscount: true, cashierId: 1, payments: [{ method: 'cash', amount: quote.total, cash_tendered: quote.total }], idempotencyKey: 'commerce-checkout-retry' };
  const sale = await checkoutSale(db, held.id, opts);
  const replay = await checkoutSale(db, held.id, opts);
  assert.equal(Number(sale.grand_total), quote.total);
  assert.equal(Number(sale.tax_amount), quote.tax);
  assert.equal(sale.id, replay.id);
  const movements = await db.get("SELECT COUNT(*) AS n FROM inventory_movements WHERE reference_type='retail_sale' AND variant_id=?", [variantId]);
  assert.ok(Number(movements.n) <= 1);
  const bySku = await listRetailSales(db, { search: `COM-${(await db.get('SELECT product_id FROM product_variants WHERE id=?', [variantId])).product_id}`, pageSize: 1 });
  assert.equal(Number(bySku.rows[0].id), Number(sale.id));
  const byBarcode = await listRetailSales(db, { search: 'EXACT-ALT-100', pageSize: 1 });
  assert.equal(Number(byBarcode.rows[0].id), Number(sale.id));
  const above = await listRetailSales(db, { minAmount: quote.total + 1, pageSize: 1 });
  assert.equal(above.pagination.total, 0);
});
test('catalog stock status is filtered before pagination', async () => {
  const stocked = await searchCommerce(db, { query: 'Commerce Product', group: 'products', stockStatus: 'in_stock', limit: 40, can });
  assert.deepEqual(stocked.groups[0].results.map((row) => Number(row.id)), [Number(variantId)]);
  assert.equal(stocked.groups[0].has_more, false);
  const unstocked = await searchCommerce(db, { query: 'Commerce Product', group: 'products', stockStatus: 'out_of_stock', limit: 40, can });
  assert.equal(unstocked.groups[0].results.length, 40);
  assert.equal(unstocked.groups[0].has_more, true);
  assert.ok(unstocked.groups[0].results.every((row) => Number(row.id) !== Number(variantId)));
});

test('movement search preserves joined-query results, pagination and cost filtering', async () => {
  for (const query of ['Commerce Product', 'COM-', 'retail_sale', '%', '_', "' OR 1=1 --", 'missing identity']) {
    const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    const expected = await db.all(`SELECT m.id FROM inventory_movements m JOIN product_variants v ON v.id=m.variant_id
      JOIN products p ON p.id=v.product_id LEFT JOIN inventory_batches b ON b.id=m.batch_id
      WHERE lower(p.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(v.sku,'')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(b.batch_number,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(m.reference_type,'')) LIKE ? ESCAPE '\\'
      ORDER BY m.id DESC`, [pattern,pattern,pattern,pattern]);
    const result = await queryRetailMovements(db, { query, pageSize: 1 });
    assert.equal(result.pagination.total, expected.length, query);
    assert.deepEqual(result.rows.map((row)=>row.id),expected.slice(0,1).map((row)=>row.id),query);
    assert.ok(result.rows.every((row)=>!('unit_cost' in row) && !('total_cost' in row)));
    if(expected.length>1) {
      const next=await queryRetailMovements(db,{query,pageSize:1,page:2,showCost:true});
      assert.equal(next.rows[0].id,expected[1].id);
      assert.ok('total_cost' in next.rows[0]);
    }
  }
});
