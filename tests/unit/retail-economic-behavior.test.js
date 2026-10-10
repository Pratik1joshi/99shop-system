import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database, { PosDatabase } from '../../lib/db/index.js';
import { ensureProductVariantsSchema, ensureStandardVariant } from '../../lib/product-variants.js';
import { openBusinessDay, businessDaySummary } from '../../lib/business-days.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { ensureAccountingSchema, accountBalance } from '../../lib/accounting.js';
import { paySupplier, supplierOpenInvoices } from '../../lib/accounting-suppliers.js';
import { holdSale, checkoutSale, ensureRetailSalesSchema, getRetailSale, quoteRetailSale } from '../../lib/retail-sales.js';
import { ensureRetailInventorySchema, receiveStock, getAvailableStock, getDefaultLocation, getInTransitLocation, getQuarantineLocation, createLocation, adjustStock } from '../../lib/retail-inventory.js';
import { createReturn, postReturn, ensureRetailReturnsSchema } from '../../lib/retail-returns.js';
import { registerSerialsOnReceipt, returnSerial, returnSerialToSupplier, transferSerial } from '../../lib/retail-serials.js';
import { createPurchaseOrder, submitPurchaseOrder, approvePurchaseOrder, createGoodsReceipt, postGoodsReceipt, createPurchaseReturn, postPurchaseReturn, ensureRetailPurchasingSchema } from '../../lib/retail-purchasing.js';
import { createStockCount, setCountQuantity, setCountSerials, completeCounting, postStockCount } from '../../lib/retail-stock-counts.js';
import { recordManualAdjustment, recordDamage, moveToQuarantine, releaseFromQuarantine } from '../../lib/retail-inventory-adjustments.js';
import { createTransfer, dispatchTransfer, receiveTransfer } from '../../lib/retail-transfers.js';
import { issueStoreCredit, adjustStoreCredit } from '../../lib/retail-store-credit.js';
import { adjustLoyaltyPoints } from '../../lib/retail-loyalty.js';
import { runRetailReconciliation } from '../../lib/retail-reconciliation.js';
import { ensureColumn } from '../../lib/db/schema-helpers.js';
import { ensureRetailPromotionSchema } from '../../lib/retail-promotions.js';
import { postExchange } from '../../lib/retail-exchanges.js';
import { collectRetailCredits } from '../../lib/retail-receivables.js';
import { retailCustomerAttention, listRetailCustomers } from '../../lib/retail-customers.js';
import { buildRetailReport } from '../../lib/retail-reporting.js';
import { getExecutiveDashboard, getRetailSalesTotals, getSalesByDimension } from '../../lib/retail-analytics.js';
import { getPerformance } from '../../lib/payroll.js';
import { financeDashboard } from '../../lib/accounting-dashboard.js';
import { listReminderCandidates, recordReminder } from '../../lib/retail-reminders.js';
import { ensureRetailCommerceSchema } from '../../lib/retail-commerce-schema.js';
import { publicCatalog } from '../../lib/retail-storefront.js';
import { planProductImport, importProducts } from '../../lib/retail-product-import.js';
import { PRODUCT_CSV_SAMPLE } from '../../lib/retail-catalog-matrix.js';
import { getVariantAttributes } from '../../lib/product-catalog.js';

const file = path.join(os.tmpdir(), `retail-economic-${process.pid}-${Date.now()}.db`);
const usePostgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || '');
const db = usePostgres ? Database.getInstance() : new PosDatabase(file);
const actor = { id: 1, full_name: 'Retail Admin', role: 'admin' };
let day;
let location;
let seq = 0;

test.after(async () => {
  try { await db.close(); } catch {}
  if (!usePostgres) {
    for (const suffix of ['', '-shm', '-wal']) try { fs.unlinkSync(`${file}${suffix}`); } catch {}
  }
});

async function product({ price = 100, cost = 40, tracking = 'none', stock = 20 } = {}) {
  const category = await db.get(`SELECT id FROM product_categories ORDER BY id LIMIT 1`);
  const id = (await db.run(`INSERT INTO products (name,category_id,base_price,is_available) VALUES (?,?,?,1)`, [`Phase0 ${++seq}`, category.id, price])).lastInsertRowid;
  const [variant] = await ensureStandardVariant(db, id, { price, stockUnit: 'pcs' });
  await db.run(`UPDATE product_variants SET tracking_mode=? WHERE id=?`, [tracking, variant.id]);
  if (stock > 0 && tracking === 'none') await receiveStock(db, { variantId: variant.id, locationId: location.id, quantity: stock, unitCost: cost, movementType: 'OPENING_STOCK', referenceType: 'phase0_fixture', referenceId: seq, businessDayId: day.id });
  return { id, variantId: variant.id, price, cost };
}

async function checkout(item, quantity, payments, extra = {}) {
  const lines = [{ variant_id: item.variantId, quantity, ...(extra.serialNumbers ? { serial_numbers: extra.serialNumbers } : {}) }];
  const held = await holdSale(db, { lines, cashierId: actor.id, customerId: extra.customerId });
  return checkoutSale(db, held.id, {
    lines, payments: payments.map((p) => p.method === 'cash' ? { ...p, cash_tendered: p.cash_tendered ?? p.amount } : p), cashierId: actor.id, customerId: extra.customerId,
    allowCredit: true, allowDiscount: true, discountAmount: extra.discountAmount,
    redeemLoyaltyPoints: extra.redeemLoyaltyPoints, couponCode: extra.couponCode,
    idempotencyKey: extra.key || `checkout-${held.id}-${Date.now()}`,
  });
}

test('setup canonical retail transaction environment', async () => {
  await ensureAccountingSchema(db);
  await ensureProductVariantsSchema(db);
  await ensureRetailInventorySchema(db);
  await ensureRetailSalesSchema(db);
  await ensureRetailReturnsSchema(db);
  await ensureRetailPurchasingSchema(db);
  day = await openBusinessDay(db, { business_date: getNepaliDateString(), opening_cash: 0 }, actor);
  location = await getDefaultLocation(db);
  if (!(await db.get(`SELECT id FROM product_categories LIMIT 1`))) {
    await db.run(`INSERT INTO product_categories (name, display_order) VALUES ('Phase 0 Products', 1)`);
  }
  if (!(await db.get(`SELECT id FROM suppliers LIMIT 1`))) {
    await db.run(`INSERT INTO suppliers (name,normalized_name) VALUES ('Phase 0 Supplier','phase 0 supplier')`);
  }
  if (!(await db.get(`SELECT id FROM customers LIMIT 1`))) {
    await db.run(`INSERT INTO customers (name,phone) VALUES ('Phase 0 Customer','9800000000')`);
  }
  assert.ok(day.id && location.id);
});

test('cash checkout updates sale, payment, inventory, historical COGS and a balanced journal', async () => {
  const item = await product({ price: 100, cost: 40, stock: 5 });
  const sale = await checkout(item, 2, [{ method: 'cash', amount: 200, cash_tendered: 200 }]);
  assert.equal(sale.status, 'COMPLETED');
  assert.equal(sale.payments[0].method, 'cash');
  assert.equal(Number(sale.cogs_total), 80);
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 3);
  const journal = await db.get(`SELECT id FROM journal_entries WHERE source_type='retail_sale' AND source_id=?`, [sale.id]);
  const balance = await db.get(`SELECT SUM(debit) AS debit,SUM(credit) AS credit FROM journal_lines WHERE journal_id=?`, [journal.id]);
  assert.equal(Number(balance.debit), Number(balance.credit));
});

test('split payment and credit sale persist exact allocations and customer-tagged AR', async () => {
  const customer = await db.get(`SELECT id FROM customers ORDER BY id LIMIT 1`);
  const item = await product({ price: 150, cost: 60, stock: 5 });
  const split = await checkout(item, 1, [{ method: 'cash', amount: 50 }, { method: 'online', amount: 100 }]);
  assert.deepEqual(split.payments.map((p) => p.method).sort(), ['cash', 'online']);
  const credit = await checkout(item, 1, [{ method: 'credit', amount: 150 }], { customerId: customer.id });
  assert.equal(Number(credit.amount_due), 150);
  const ar = await db.get(`SELECT jl.customer_id,jl.debit FROM journal_entries je JOIN journal_lines jl ON jl.journal_id=je.id JOIN accounts a ON a.id=jl.account_id WHERE je.source_type='retail_sale' AND je.source_id=? AND a.code='1300'`, [credit.id]);
  assert.equal(Number(ar.customer_id), Number(customer.id));
  assert.equal(Number(ar.debit), 150);
});

test('credit limit blocks checkout unless an override reason is audited', async () => {
  const customerId = (await db.run(`INSERT INTO customers (name,phone,credit_limit) VALUES (?,?,?)`,
    [`Credit Limit ${++seq}`, `9800${String(seq).padStart(6, '0')}`, 50])).lastInsertRowid;
  const item = await product({ price: 100, cost: 25, stock: 2 });
  const lines = [{ variant_id: item.variantId, quantity: 1 }];
  const held = await holdSale(db, { lines, cashierId: actor.id, customerId });
  const opts = { lines, payments: [{ method: 'credit', amount: 100 }], cashierId: actor.id,
    customerId, allowCredit: true, idempotencyKey: `credit-override-${held.id}` };
  await assert.rejects(checkoutSale(db, held.id, opts), /credit limit/i);
  assert.equal((await db.get('SELECT status FROM retail_sales WHERE id=?', [held.id])).status, 'HELD');
  const sale = await checkoutSale(db, held.id, { ...opts, allowCreditOverride: true,
    creditOverrideReason: 'Manager approved after customer review' });
  assert.equal(sale.status, 'COMPLETED');
  const override = await db.get('SELECT * FROM retail_credit_overrides WHERE retail_sale_id=?', [sale.id]);
  assert.equal(override.approved_by, actor.id);
  assert.equal(Number(override.credit_limit), 50);
  assert.equal(Number(override.credit_amount), 100);
  assert.match(override.reason, /customer review/);
  const attention = await retailCustomerAttention(db);
  assert.ok(attention.over_limit.some((row) => Number(row.id) === Number(customerId) && row.amount === 100));
  const filtered = await listRetailCustomers(db, { filter: 'over_limit' });
  assert.ok(filtered.customers.some((row) => Number(row.id) === Number(customerId)));
  const replay = await checkoutSale(db, held.id, { ...opts, allowCreditOverride: true,
    creditOverrideReason: 'Manager approved after customer review' });
  assert.equal(replay.id, sale.id);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM retail_credit_overrides WHERE retail_sale_id=?', [sale.id])).n), 1);
});

test('one partial collection allocates across two credit sales without another revenue posting', async () => {
  const customer = await db.get(`SELECT id FROM customers ORDER BY id LIMIT 1`);
  const item = await product({ price: 100, cost: 35, stock: 4 });
  const first = await checkout(item, 1, [{ method: 'credit', amount: 100 }], { customerId: customer.id });
  const second = await checkout(item, 1, [{ method: 'credit', amount: 100 }], { customerId: customer.id });
  const { retailCustomerStatement } = await import('@/lib/retail-customer-statements.js');
  const beforeStatement = await retailCustomerStatement(db, { customerId: customer.id });
  const beforeRevenue = await accountBalance(db, '4010');
  const beforeAr = await accountBalance(db, '1300', { customerId: customer.id });
  const key = `multi-collection-${Date.now()}-${++seq}`;
  const request = { customerId: customer.id, allocations: [{ saleId: first.id, amount: 60 }, { saleId: second.id, amount: 40 }],
    method: 'cash', actorId: actor.id, externalRef: key };
  const collection = await collectRetailCredits(db, request);
  const replay = await collectRetailCredits(db, request);
  assert.equal(replay.id, collection.id);
  assert.equal(collection.allocations.length, 2);
  assert.equal(Number((await db.get(`SELECT amount_due FROM retail_sales WHERE id=?`, [first.id])).amount_due), 40);
  assert.equal(Number((await db.get(`SELECT amount_due FROM retail_sales WHERE id=?`, [second.id])).amount_due), 60);
  assert.equal(await accountBalance(db, '4010'), beforeRevenue);
  assert.equal(Math.round(Number(await accountBalance(db, '1300', { customerId: customer.id })) * 100), Math.round((Number(beforeAr) - 100) * 100));
  const statement = await retailCustomerStatement(db, { customerId: customer.id });
  assert.equal(statement.closing_balance, beforeStatement.closing_balance - 100);
  assert.ok(statement.lines.some((line) => line.source_type === 'retail_credit_collection' && line.credit === 100));
});

test('register closing summary classifies Retail cash sales and collections', async () => {
  const before = await businessDaySummary(db, day.id);
  const item = await product({ price: 75, cost: 20, stock: 2 });
  await checkout(item, 1, [{ method: 'cash', amount: 75 }]);
  const after = await businessDaySummary(db, day.id);
  assert.equal(after.retail.completed_sales, before.retail.completed_sales + 1);
  assert.equal(after.cash.breakdown.cash_collections, before.cash.breakdown.cash_collections + 75);
  assert.equal(after.cash.breakdown.credit_collections, before.cash.breakdown.credit_collections);
  assert.ok(after.retail.payments.some((row) => row.method === 'cash' && row.amount >= 75));
});

test('store-credit sale and loyalty redemption change their ledgers without inventing cash', async () => {
  const customer = await db.get(`SELECT id FROM customers ORDER BY id LIMIT 1`);
  await issueStoreCredit(db, { customerId: customer.id, amount: 100, sourceType: 'phase0_fixture', sourceId: 9001, businessDayId: day.id, createdBy: actor.id });
  await adjustLoyaltyPoints(db, { customerId: customer.id, points: 100, reason: 'Phase 0 fixture', createdBy: actor.id });
  const item = await product({ price: 100, cost: 30, stock: 4 });
  const storeSale = await checkout(item, 1, [{ method: 'store_credit', amount: 100 }], { customerId: customer.id });
  assert.equal(storeSale.payments[0].method, 'store_credit');
  const creditBalance = await db.get(`SELECT store_credit_balance FROM customers WHERE id=?`, [customer.id]);
  assert.equal(Number(creditBalance.store_credit_balance), 0);
  const loyaltySale = await checkout(item, 1, [{ method: 'cash', amount: 90 }], { customerId: customer.id, redeemLoyaltyPoints: 100 });
  assert.equal(Number(loyaltySale.grand_total), 90);
  assert.ok(await db.get(`SELECT id FROM loyalty_transactions WHERE source_type='retail_sale' AND source_id=? AND type='REDEEM'`, [loyaltySale.id]));
});

test('manual store credit correction is reasoned, journaled and idempotent', async () => {
  const customer = await db.get('SELECT id FROM customers ORDER BY id LIMIT 1');
  const beforeLiability = Number(await accountBalance(db, '2030'));
  const key = `store-correction-${Date.now()}`;
  const request = { customerId: customer.id, amount: 25, reason: 'Correct return value', createdBy: actor.id,
    businessDayId: day.id, idempotencyKey: key };
  const first = await adjustStoreCredit(db, request);
  const replay = await adjustStoreCredit(db, request);
  assert.equal(replay.transactionId, first.transactionId);
  assert.equal(replay.balance, first.balance);
  assert.equal(Number(await accountBalance(db, '2030')), beforeLiability - 25);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM journal_entries WHERE source_type=? AND source_id=?',
    ['store_credit_adjustment', first.transactionId])).n), 1);
  await assert.rejects(adjustStoreCredit(db, { ...request, amount: 30 }), /already used/i);
  const corrected = await adjustStoreCredit(db, { ...request, amount: -10,
    idempotencyKey: `${key}-reverse`, reason: 'Reverse excess issue' });
  assert.equal(corrected.balance, first.balance - 10);
  assert.equal(Number(await accountBalance(db, '2030')), beforeLiability - 15);
});

test('promotion sale records the applied offer and reconciles discount to the sale snapshot', async () => {
  await ensureRetailPromotionSchema(db);
  const promo = await db.run(
    `INSERT INTO promotions (name,discount_type,discount_value,scope,channels,auto_apply,is_active)
     VALUES ('Phase 0 ten percent','percent',10,'order','["retail_pos"]',1,1)`
  );
  const item = await product({ price: 100, cost: 20, stock: 2 });
  const sale = await checkout(item, 1, [{ method: 'cash', amount: 90 }]);
  assert.equal(Number(sale.grand_total), 90);
  assert.equal(Number(sale.lines[0].discount_amount), 10);
  assert.ok(await db.get(`SELECT id FROM promotion_redemptions WHERE promotion_id=? AND retail_sale_id=?`, [promo.lastInsertRowid, sale.id]));
  await db.run(`UPDATE promotions SET is_active=0 WHERE id=?`, [promo.lastInsertRowid]);
});

test('retry is idempotent and competing checkout cannot sell the last item twice', async () => {
  const item = await product({ price: 80, cost: 20, stock: 2 });
  const lines = [{ variant_id: item.variantId, quantity: 1 }];
  const held = await holdSale(db, { lines, cashierId: actor.id });
  const opts = { lines, payments: [{ method: 'cash', amount: 80, cash_tendered: 80 }], cashierId: actor.id, idempotencyKey: `retry-${Date.now()}` };
  const first = await checkoutSale(db, held.id, opts);
  const replay = await checkoutSale(db, held.id, opts);
  assert.equal(replay.id, first.id);
  assert.equal(Number((await db.get(`SELECT COUNT(*) AS n FROM inventory_movements WHERE reference_type='retail_sale_line' AND reference_id=?`, [first.lines[0].id])).n), 1);

  const a = await holdSale(db, { lines, cashierId: actor.id });
  const b = await holdSale(db, { lines, cashierId: actor.id });
  await checkoutSale(db, a.id, { ...opts, idempotencyKey: `last-a-${Date.now()}` });
  await assert.rejects(checkoutSale(db, b.id, { ...opts, idempotencyKey: `last-b-${Date.now()}` }), /available|insufficient/i);
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 0);
});

test('partial and full returns apply disposition, payments, COGS and inventory exactly once', async () => {
  const item = await product({ price: 120, cost: 50, stock: 4 });
  const sale = await checkout(item, 2, [{ method: 'cash', amount: 240 }]);
  const first = await createReturn(db, { originalSaleId: sale.id, cashierId: actor.id, lines: [{ originalSaleLineId: sale.lines[0].id, quantity: 1, condition: 'UNOPENED', disposition: 'RETURN_TO_SELLABLE' }] });
  const postedFirst = await postReturn(db, first.id, { postedBy: actor.id, refundMethod: 'cash', businessDayId: day.id, idempotencyKey: `return-1-${Date.now()}` });
  assert.equal(postedFirst.status, 'POSTED');
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 3);
  const second = await createReturn(db, { originalSaleId: sale.id, cashierId: actor.id, lines: [{ originalSaleLineId: sale.lines[0].id, quantity: 1, condition: 'DAMAGED', disposition: 'NO_STOCK_RETURN' }] });
  await postReturn(db, second.id, { postedBy: actor.id, refundMethod: 'cash', businessDayId: day.id, allowNonResellable: true });
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 3);
  await assert.rejects(createReturn(db, { originalSaleId: sale.id, lines: [{ originalSaleLineId: sale.lines[0].id, quantity: 1, condition: 'UNOPENED', disposition: 'RETURN_TO_SELLABLE' }] }), /only 0|returnable/i);
});

test('serial sale requires identity, validates ownership, and marks the exact serial sold', async () => {
  const item = await product({ price: 500, cost: 300, stock: 0, tracking: 'serial' });
  await registerSerialsOnReceipt(db, { variantId: item.variantId, locationId: location.id, serialNumbers: ['P0-SERIAL-1'], unitCost: 300, referenceType: 'phase0_fixture', referenceId: 9101, businessDayId: day.id });
  const missing = await holdSale(db, { lines: [{ variant_id: item.variantId, quantity: 1 }], cashierId: actor.id });
  await assert.rejects(checkoutSale(db, missing.id, { lines: [{ variant_id: item.variantId, quantity: 1 }], payments: [{ method: 'cash', amount: 500, cash_tendered: 500 }], cashierId: actor.id, idempotencyKey: 'serial-missing' }), /select exactly 1 serial/i);
  const sale = await checkout(item, 1, [{ method: 'cash', amount: 500 }], { serialNumbers: ['P0-SERIAL-1'] });
  const serial = await db.get(`SELECT status,sale_line_id FROM inventory_serials WHERE serial_number='P0-SERIAL-1'`);
  assert.equal(serial.status, 'SOLD');
  assert.equal(Number(serial.sale_line_id), Number(sale.lines[0].id));
});

test('serial identity survives hold/resume, return, transfer, supplier return and a checkout race', async () => {
  const item = await product({ price: 500, cost: 300, stock: 0, tracking: 'serial' });
  await registerSerialsOnReceipt(db, { variantId: item.variantId, locationId: location.id, serialNumbers: ['P0-LIFE-A', 'P0-LIFE-B', 'P0-LIFE-C'], unitCost: 300, referenceType: 'phase0_serial_lifecycle', referenceId: 9150, businessDayId: day.id });
  const held = await holdSale(db, { lines: [{ variant_id: item.variantId, quantity: 1, serial_numbers: ['P0-LIFE-A'] }], cashierId: actor.id });
  assert.deepEqual(held.lines[0].serial_numbers, ['P0-LIFE-A']);
  const sold = await checkoutSale(db, held.id, { lines: [{ variant_id: item.variantId, quantity: 1, serial_numbers: held.lines[0].serial_numbers }], payments: [{ method: 'cash', amount: 500, cash_tendered: 500 }], cashierId: actor.id, idempotencyKey: `serial-life-${Date.now()}` });
  await assert.rejects(returnSerial(db, { serialNumber: 'P0-LIFE-A', originalSaleLineId: sold.lines[0].id }), /stable return line identity/i);
  const returnDraft = await createReturn(db, { originalSaleId: sold.id, cashierId: actor.id,
    lines: [{ originalSaleLineId: sold.lines[0].id, quantity: 1, condition: 'UNOPENED', disposition: 'RETURN_TO_SELLABLE' }] });
  await postReturn(db, returnDraft.id, { postedBy: actor.id, refundMethod: 'cash', businessDayId: day.id });
  const destination = await createLocation(db, { name: `Serial Destination ${Date.now()}`, code: `SER-${seq}` });
  await transferSerial(db, { serialNumber: 'P0-LIFE-A', fromLocationId: location.id, toLocationId: destination.id, businessDayId: day.id, createdBy: actor.id });
  assert.equal(Number((await db.get(`SELECT location_id FROM inventory_serials WHERE serial_number='P0-LIFE-A'`)).location_id), Number(destination.id));
  await returnSerialToSupplier(db, { serialNumber: 'P0-LIFE-B', businessDayId: day.id, createdBy: actor.id });
  assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number='P0-LIFE-B'`)).status, 'RETURNED_TO_SUPPLIER');

  const line = [{ variant_id: item.variantId, quantity: 1, serial_numbers: ['P0-LIFE-C'] }];
  const left = await holdSale(db, { lines: line, cashierId: actor.id });
  const right = await holdSale(db, { lines: line, cashierId: actor.id });
  const settle = (sale, i) => checkoutSale(db, sale.id, { lines: line, payments: [{ method: 'cash', amount: 500, cash_tendered: 500 }], cashierId: actor.id, idempotencyKey: `serial-race-${Date.now()}-${i}` });
  if (usePostgres) {
    const outcomes = await Promise.allSettled([settle(left, 0), settle(right, 1)]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  } else {
    await settle(left, 0);
    await assert.rejects(settle(right, 1), /available|insufficient|SOLD/i);
  }
  assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number='P0-LIFE-C'`)).status, 'SOLD');
});

test('batch checkout uses FEFO and rejects expired-only availability', async () => {
  const item = await product({ price: 60, cost: 10, stock: 0, tracking: 'batch' });
  await receiveStock(db, { variantId: item.variantId, locationId: location.id, quantity: 2, unitCost: 10, batchNumber: 'P0-LATE', expiryDate: '2099-12-31', referenceType: 'phase0_fixture', referenceId: 9201, businessDayId: day.id });
  await receiveStock(db, { variantId: item.variantId, locationId: location.id, quantity: 1, unitCost: 12, batchNumber: 'P0-EARLY', expiryDate: '2099-01-01', referenceType: 'phase0_fixture', referenceId: 9202, businessDayId: day.id });
  const sale = await checkout(item, 1, [{ method: 'cash', amount: 60 }]);
  const allocation = await db.get(`SELECT b.batch_number FROM retail_sale_line_batches a JOIN inventory_batches b ON b.id=a.batch_id WHERE a.retail_sale_line_id=?`, [sale.lines[0].id]);
  assert.equal(allocation.batch_number, 'P0-EARLY');
  const expired = await product({ price: 20, cost: 5, stock: 0, tracking: 'batch' });
  await receiveStock(db, { variantId: expired.variantId, locationId: location.id, quantity: 1, unitCost: 5, batchNumber: 'P0-EXPIRED', expiryDate: '2000-01-01', referenceType: 'phase0_fixture', referenceId: 9203, businessDayId: day.id });
  await assert.rejects(checkout(expired, 1, [{ method: 'cash', amount: 20 }]), /available|expired|insufficient/i);
});

test('GRN, partial GRN and purchase return reconcile inventory, AP and journals', async () => {
  const supplier = await db.get(`SELECT id FROM suppliers ORDER BY id LIMIT 1`);
  const item = await product({ price: 70, cost: 0, stock: 0 });
  const grn = await createGoodsReceipt(db, { supplierId: supplier.id, locationId: location.id, paymentMethod: 'credit', lines: [{ variantId: item.variantId, quantityReceived: 3, unitCost: 25 }] });
  const posted = await postGoodsReceipt(db, grn.id, { postedBy: actor.id, businessDayId: day.id });
  assert.equal(posted.status, 'POSTED');
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 3);
  const ret = await createPurchaseReturn(db, { supplierId: supplier.id, goodsReceiptId: grn.id, locationId: location.id, lines: [{ goodsReceiptLineId: posted.lines[0].id, variantId: item.variantId, quantity: 1 }] });
  await postPurchaseReturn(db, ret.id, { postedBy: actor.id, businessDayId: day.id });
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 2);
  assert.ok(await db.get(`SELECT id FROM journal_entries WHERE source_type='goods_receipt' AND source_id=?`, [grn.id]));
    assert.ok(await db.get(`SELECT id FROM journal_entries WHERE source_type='purchase_return' AND source_id=?`, [ret.id]));
    const apBefore = await accountBalance(db, '2010', { supplierId: supplier.id });
    const expenseBefore = await accountBalance(db, '5020');
    await paySupplier(db, { supplier_id: supplier.id, amount: 10, method: 'cash', created_by: actor.id,
      external_ref: `retail-supplier-payment-${Date.now()}-${seq}` });
    const apAfter = await accountBalance(db, '2010', { supplierId: supplier.id });
    assert.equal(Math.round((apAfter - apBefore) * 100), 1000);
    assert.equal(await accountBalance(db, '5020'), expenseBefore);
    const invoice = (await supplierOpenInvoices(db, supplier.id)).find((row) => Number(row.goods_receipt_id) === Number(grn.id));
    assert.ok(invoice?.journal_id);
    const paymentRef = `retail-allocated-payment-${Date.now()}-${seq}`;
    const paymentId = await paySupplier(db, { supplier_id: supplier.id, amount: 5, method: 'cash', created_by: actor.id,
      external_ref: paymentRef, allocations: [{ journal_id: invoice.journal_id, amount: 5 }] });
    assert.equal(await paySupplier(db, { supplier_id: supplier.id, amount: 5, method: 'cash', created_by: actor.id,
      external_ref: paymentRef, allocations: [{ journal_id: invoice.journal_id, amount: 5 }] }), paymentId);
    const afterInvoice = (await supplierOpenInvoices(db, supplier.id)).find((row) => Number(row.goods_receipt_id) === Number(grn.id));
    assert.equal(Math.round((invoice.outstanding - afterInvoice.outstanding) * 100), 500);
    assert.equal(await accountBalance(db, '5020'), expenseBefore);
});

test('partial GRN advances the purchase order only by received quantity', async () => {
  const supplier = await db.get(`SELECT id FROM suppliers ORDER BY id LIMIT 1`);
  const item = await product({ price: 30, stock: 0 });
  const po = await createPurchaseOrder(db, { supplierId: supplier.id, locationId: location.id, createdBy: actor.id, lines: [{ variantId: item.variantId, orderedQuantity: 5, unitCost: 10 }] });
  await submitPurchaseOrder(db, po.id, { submittedBy: actor.id });
  await approvePurchaseOrder(db, po.id, { approvedBy: actor.id });
  const grn = await createGoodsReceipt(db, { supplierId: supplier.id, purchaseOrderId: po.id, locationId: location.id, lines: [{ purchaseOrderLineId: po.lines[0].id, variantId: item.variantId, quantityReceived: 2, unitCost: 10 }] });
  await postGoodsReceipt(db, grn.id, { postedBy: actor.id, businessDayId: day.id });
  const line = await db.get(`SELECT quantity_received FROM purchase_order_lines WHERE id=?`, [po.lines[0].id]);
  const header = await db.get(`SELECT status FROM purchase_orders WHERE id=?`, [po.id]);
  assert.equal(Number(line.quantity_received), 2);
  assert.equal(header.status, 'PARTIALLY_RECEIVED');
});

test('supplier return keeps exact serial identity and rejects a mismatched receipt line', async () => {
  const supplier = await db.get(`SELECT id FROM suppliers ORDER BY id LIMIT 1`);
  const item = await product({ price: 90, stock: 0, tracking: 'serial' });
  const serial = `SUP-RET-${Date.now()}-${++seq}`;
  const grn = await createGoodsReceipt(db, { supplierId: supplier.id, locationId: location.id,
    paymentMethod: 'credit', lines: [{ variantId: item.variantId, quantityReceived: 1, unitCost: 30, serialNumbers: [serial] }] });
  const posted = await postGoodsReceipt(db, grn.id, { postedBy: actor.id, businessDayId: day.id });
  await assert.rejects(createPurchaseReturn(db, { supplierId: supplier.id, goodsReceiptId: grn.id,
    lines: [{ goodsReceiptLineId: posted.lines[0].id, variantId: item.variantId + 1, quantity: 1 }] }), /does not match/i);
  const ret = await createPurchaseReturn(db, { supplierId: supplier.id, goodsReceiptId: grn.id,
    lines: [{ goodsReceiptLineId: posted.lines[0].id, variantId: item.variantId, quantity: 1, serialNumbers: [serial] }] });
  await postPurchaseReturn(db, ret.id, { postedBy: actor.id, businessDayId: day.id });
  const identity = await db.get(`SELECT status FROM inventory_serials WHERE serial_number=?`, [serial]);
  assert.equal(identity.status, 'RETURNED_TO_SUPPLIER');
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 0);
  await assert.rejects(createPurchaseReturn(db, { supplierId: supplier.id, goodsReceiptId: grn.id,
    lines: [{ goodsReceiptLineId: posted.lines[0].id, variantId: item.variantId, quantity: 1, serialNumbers: [serial] }] }), /exceeds|not available/i);
});

test('serial transfer retains identity through dispatch and receipt', async () => {
  const item = await product({ price: 100, stock: 0, tracking: 'serial' });
  const serial = `TR-SERIAL-${Date.now()}-${++seq}`;
  await registerSerialsOnReceipt(db, { variantId: item.variantId, locationId: location.id,
    serialNumbers: [serial], unitCost: 40, referenceType: 'phase0_fixture', referenceId: seq,
    businessDayId: day.id });
  const destination = await createLocation(db, { name: `Transfer destination ${seq}`, code: `TR-${seq}`, type: 'shop' });
  const transfer = await createTransfer(db, { sourceLocationId: location.id, destinationLocationId: destination.id,
    requestedBy: actor.id, lines: [{ variantId: item.variantId, quantity: 1, serialNumbers: [serial] }] });
  await dispatchTransfer(db, transfer.id, { dispatchedBy: actor.id });
  const transit = await getInTransitLocation(db);
  assert.equal(Number((await db.get(`SELECT location_id FROM inventory_serials WHERE serial_number=?`, [serial])).location_id), Number(transit.id));
  await receiveTransfer(db, transfer.id, { receivedBy: actor.id,
    lines: [{ lineId: transfer.lines[0].id, receivedQuantity: 1, serialNumbers: [serial] }] });
  assert.equal(Number((await db.get(`SELECT location_id FROM inventory_serials WHERE serial_number=?`, [serial])).location_id), Number(destination.id));
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: destination.id }), 1);
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 0);
});

test('serial count posts missing and found identities even when net quantity is zero', async () => {
  const item = await product({ price: 120, stock: 0, tracking: 'serial' });
  const first = `COUNT-A-${Date.now()}-${++seq}`;
  const second = `COUNT-B-${Date.now()}-${seq}`;
  const found = `COUNT-FOUND-${Date.now()}-${seq}`;
  await registerSerialsOnReceipt(db, { variantId: item.variantId, locationId: location.id,
    serialNumbers: [first, second], unitCost: 45, referenceType: 'phase0_fixture', referenceId: seq, businessDayId: day.id });
  const before = await runRetailReconciliation(db);
  const count = await createStockCount(db, { locationId: location.id, countType: 'CYCLE', variantIds: [item.variantId], createdBy: actor.id, blind: true });
  await assert.rejects(setCountQuantity(db, count.id, count.lines[0].id, { physicalQuantity: 2 }), /exact serial/i);
  await setCountSerials(db, count.id, count.lines[0].id, { serialNumbers: [first, found], countedBy: actor.id });
  await completeCounting(db, count.id, { completedBy: actor.id });
  const posted = await postStockCount(db, count.id, { approvedBy: actor.id });
  assert.equal(posted.status, 'POSTED');
  assert.equal(Number((await db.get(`SELECT status FROM inventory_serials WHERE serial_number=?`, [second])).status === 'MISSING'), 1);
  assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number=?`, [found])).status, 'IN_STOCK');
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 2);
  const after = await runRetailReconciliation(db);
  assert.equal(after.inventoryProjection.reconciled, true);
  assert.equal(after.checks[0].difference, before.checks[0].difference);
});

test('serial adjustment requires identities for gain, loss, and quarantine', async () => {
  const item = await product({ price: 100, stock: 0, tracking: 'serial' });
  const serial = `ADJ-SERIAL-${Date.now()}-${++seq}`;
  const before = await runRetailReconciliation(db);
  await assert.rejects(recordManualAdjustment(db, { variantId: item.variantId, locationId: location.id,
    quantity: 1, reason: 'FOUND_STOCK', createdBy: actor.id }), /serial identity/i);
  await recordManualAdjustment(db, { variantId: item.variantId, locationId: location.id,
    quantity: 1, serialNumbers: [serial], reason: 'FOUND_STOCK', unitCost: 25, createdBy: actor.id });
  const quarantine = await getQuarantineLocation(db);
  await moveToQuarantine(db, { variantId: item.variantId, fromLocationId: location.id, quantity: 1,
    serialNumbers: [serial], createdBy: actor.id });
  assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number=?`, [serial])).status, 'QUARANTINE');
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: quarantine.id }), 1);
  await releaseFromQuarantine(db, { variantId: item.variantId, toLocationId: location.id, quantity: 1,
    serialNumbers: [serial], createdBy: actor.id });
  await recordDamage(db, { variantId: item.variantId, locationId: location.id, quantity: 1,
    serialNumbers: [serial], reason: 'Broken', createdBy: actor.id });
  assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number=?`, [serial])).status, 'DAMAGED');
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 0);
  const after = await runRetailReconciliation(db);
  assert.equal(after.inventoryProjection.reconciled, true);
  assert.equal(after.checks[0].difference, before.checks[0].difference);
});

test('exchange failure keeps the posted return and customer store credit recoverable', async () => {
  const customer = await db.get(`SELECT id FROM customers ORDER BY id LIMIT 1`);
  const beforeCredit = Number((await db.get('SELECT store_credit_balance FROM customers WHERE id=?', [customer.id])).store_credit_balance);
  const originalItem = await product({ price: 75, cost: 25, stock: 2 });
  const replacement = await product({ price: 90, cost: 30, stock: 0 });
  const original = await checkout(originalItem, 1, [{ method: 'cash', amount: 75 }], { customerId: customer.id });
  await assert.rejects(
    postExchange(db, {
      originalSaleId: original.id, customerId: customer.id, cashierId: actor.id, businessDayId: day.id,
      returnLines: [{ originalSaleLineId: original.lines[0].id, quantity: 1, condition: 'UNOPENED', disposition: 'RETURN_TO_SELLABLE' }],
      newSaleLines: [{ variant_id: replacement.variantId, quantity: 1 }], idempotencyKey: `failed-exchange-${Date.now()}`,
    }),
    /return .* posted, but the replacement sale failed/i
  );
  const returned = await db.get(`SELECT status FROM retail_returns WHERE original_sale_id=? ORDER BY id DESC LIMIT 1`, [original.id]);
  const balance = await db.get(`SELECT store_credit_balance FROM customers WHERE id=?`, [customer.id]);
  assert.equal(returned.status, 'POSTED');
  assert.equal(Number(balance.store_credit_balance), beforeCredit + 75);
});

test('adjustment, stock count and transfer use only movement-ledger effects', async () => {
  const item = await product({ price: 40, cost: 10, stock: 6 });
  await adjustStock(db, { variantId: item.variantId, locationId: location.id, quantity: 1, movementType: 'DAMAGE', referenceType: 'phase0_fixture', referenceId: 9301, businessDayId: day.id });
  const count = await createStockCount(db, { locationId: location.id, countType: 'CYCLE', variantIds: [item.variantId], createdBy: actor.id });
  await setCountQuantity(db, count.id, count.lines[0].id, { physicalQuantity: 4, countedBy: actor.id });
  await completeCounting(db, count.id, { completedBy: actor.id });
  await postStockCount(db, count.id, { approvedBy: actor.id });
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 4);
  const destination = await createLocation(db, { name: `Phase0 Destination ${Date.now()}`, code: `P0-${seq}` });
  const transfer = await createTransfer(db, { sourceLocationId: location.id, destinationLocationId: destination.id, requestedBy: actor.id, lines: [{ variantId: item.variantId, quantity: 2 }] });
  await dispatchTransfer(db, transfer.id, { dispatchedBy: actor.id });
  await receiveTransfer(db, transfer.id, { receivedBy: actor.id });
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 2);
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: destination.id }), 2);
});

test('damage, expiry, shrinkage, tester, sample and internal use are canonical movements', async () => {
  const item = await product({ price: 25, cost: 5, stock: 12 });
  const types = ['DAMAGE', 'EXPIRY', 'SHRINKAGE', 'TESTER', 'SAMPLE', 'INTERNAL_USE'];
  for (let i = 0; i < types.length; i++) {
    await adjustStock(db, { variantId: item.variantId, locationId: location.id, quantity: 1, movementType: types[i], referenceType: 'phase0_disposition', referenceId: 9400 + i, businessDayId: day.id });
  }
  const rows = await db.all(`SELECT movement_type FROM inventory_movements WHERE variant_id=? AND reference_type='phase0_disposition' ORDER BY id`, [item.variantId]);
  assert.deepEqual(rows.map((row) => row.movement_type), types);
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 6);
});

test('reconciliation reports explicit differences and performs no automatic repair', async () => {
  const before = await db.get(`SELECT COUNT(*) AS n FROM inventory_movements`);
  const result = await runRetailReconciliation(db);
  assert.ok(Array.isArray(result.checks));
  assert.ok(Array.isArray(result.inventoryProjection.differences));
  const after = await db.get(`SELECT COUNT(*) AS n FROM inventory_movements`);
  assert.equal(Number(after.n), Number(before.n));
});

test('dashboard/report query layer reads canonical retail facts across core dimensions', async () => {
  const dates = await db.get("SELECT MIN(date(completed_at)) AS start, MAX(date(completed_at)) AS end FROM retail_sales WHERE status='COMPLETED'");
  const range = { start: dates.start, end: dates.end };
  for (const tab of ['sales', 'inventory', 'products', 'categories', 'employees', 'customers', 'purchases', 'suppliers', 'changes']) {
    const report = await buildRetailReport(db, tab, range, {});
    assert.ok(report.tables?.length, `${tab} should return a canonical table`);
  }
  const totals = await getRetailSalesTotals(db, { from: range.start, to: range.end });
  const headers = await db.get(`SELECT COALESCE(SUM(tax_amount),0) AS tax FROM retail_sales WHERE status='COMPLETED'`);
  assert.equal(totals.tax, Number(headers.tax), 'VAT must be summed once per sale header');
  const tenders = await getSalesByDimension(db, { from: range.start, to: range.end, groupBy: 'payment_method' });
  const persisted = await db.get(`SELECT COALESCE(SUM(p.amount),0) AS amount FROM retail_sale_payments p JOIN retail_sales s ON s.id=p.retail_sale_id WHERE s.status='COMPLETED'`);
  assert.equal(tenders.reduce((sum, row) => sum + row.paymentAmount, 0), Number(persisted.amount), 'split tenders must not duplicate sales revenue');
  const products = await getSalesByDimension(db, { from: range.start, to: range.end, groupBy: 'product' });
  const dashboard = await getExecutiveDashboard(db, { from: range.start, to: range.end });
  assert.equal(Math.round(products.reduce((sum, row) => sum + row.netSales, 0) * 100), Math.round(dashboard.netSales * 100), 'product net sales must reconcile after returns');
});

test('one sale and physical return reconcile source, stock, journal, report and business day', async () => {
  const item = await product({ price: 120, cost: 50, stock: 5 });
  const dates = await db.get("SELECT date(CURRENT_TIMESTAMP) AS today");
  const range = { start: dates.today, end: dates.today };
  const before = await getExecutiveDashboard(db, { from: range.start, to: range.end });
  const beforeDay = await businessDaySummary(db, day.id);
  const staffBefore = (await getPerformance(db, { from: range.start, to: range.end })).find((row) => row.id === actor.id);
  const financeBefore = await financeDashboard(db);

  const sale = await checkout(item, 2, [{ method: 'cash', amount: 240 }]);
  const draft = await createReturn(db, { originalSaleId: sale.id, cashierId: actor.id,
    lines: [{ originalSaleLineId: sale.lines[0].id, quantity: 1, condition: 'UNOPENED', disposition: 'RETURN_TO_SELLABLE' }] });
  const returned = await postReturn(db, draft.id, { postedBy: actor.id, refundMethod: 'cash', businessDayId: day.id,
    idempotencyKey: `reconcile-${draft.id}` });
  await postReturn(db, draft.id, { postedBy: actor.id, refundMethod: 'cash', businessDayId: day.id,
    idempotencyKey: `reconcile-${draft.id}` });

  assert.equal(sale.status, 'COMPLETED');
  assert.equal(returned.status, 'POSTED');
  assert.equal(Number(sale.cogs_total), 100);
  assert.equal(Number(returned.refund_total), 120);
  assert.equal(await getAvailableStock(db, item.variantId, { locationId: location.id }), 4);
  const movements = await db.all(`SELECT movement_type,quantity,total_cost,reference_type,reference_id FROM inventory_movements
    WHERE (reference_type='retail_sale_line' AND reference_id=?) OR (reference_type='retail_return_line' AND reference_id=?) ORDER BY id`,
    [sale.lines[0].id, returned.lines[0].id]);
  assert.deepEqual(movements.map((row) => [row.movement_type, Number(row.quantity), Math.abs(Number(row.total_cost))]),
    [['SALE', -2, 100], ['CUSTOMER_RETURN', 1, 50]]);

  const journals = await db.all(`SELECT je.source_type,je.source_id,a.code,SUM(jl.debit) AS debit,SUM(jl.credit) AS credit
    FROM journal_entries je JOIN journal_lines jl ON jl.journal_id=je.id JOIN accounts a ON a.id=jl.account_id
    WHERE (je.source_type='retail_sale' AND je.source_id=?) OR (je.source_type='retail_return' AND je.source_id=?)
    GROUP BY je.source_type,je.source_id,a.code`, [sale.id, returned.id]);
  const amount = (source, code, side) => Number(journals.find((row) => row.source_type === source && row.code === code)?.[side] || 0);
  assert.equal(amount('retail_sale', '4010', 'credit'), 240);
  assert.equal(amount('retail_sale', '5080', 'debit'), 100);
  assert.equal(amount('retail_sale', '1210', 'credit'), 100);
  assert.equal(amount('retail_return', '4011', 'debit'), 120);
  assert.equal(amount('retail_return', '5080', 'credit'), 50);
  assert.equal(amount('retail_return', '1210', 'debit'), 50);
  for (const source of ['retail_sale', 'retail_return']) {
    const lines = journals.filter((row) => row.source_type === source);
    assert.equal(lines.reduce((sum, row) => sum + Number(row.debit), 0), lines.reduce((sum, row) => sum + Number(row.credit), 0));
  }

  const after = await getExecutiveDashboard(db, { from: range.start, to: range.end });
  assert.equal(Math.round((after.grossSales - before.grossSales) * 100), 24000);
  assert.equal(Math.round((after.returnedRevenue - before.returnedRevenue) * 100), 12000);
  assert.equal(Math.round((after.netSales - before.netSales) * 100), 12000);
  assert.equal(Math.round((after.cogs - before.cogs) * 100), 5000);
  assert.equal(Math.round((after.grossProfit - before.grossProfit) * 100), 7000);
  const report = await buildRetailReport(db, 'sales', range, {});
  assert.ok(report.tables[0].rows.some((row) => row.sale_number === sale.sale_number && Number(row.cogs_total) === 100));
  assert.equal(Number(report.kpis.find((item) => item.key === 'net').value), after.netSales);
  assert.equal(Number(report.kpis.find((item) => item.key === 'profit').value), after.grossProfit);
  const afterDay = await businessDaySummary(db, day.id);
  assert.equal(afterDay.retail.completed_sales - beforeDay.retail.completed_sales, 1);
  assert.equal(afterDay.retail.posted_returns - beforeDay.retail.posted_returns, 1);
  assert.equal(afterDay.retail.net_sales - beforeDay.retail.net_sales, 120);
  // Staff performance reads the same Retail facts: +1 sale, net +120 after the return.
  const staffAfter = (await getPerformance(db, { from: range.start, to: range.end })).find((row) => row.id === actor.id);
  assert.equal(staffAfter.sales_count - staffBefore.sales_count, 1);
  assert.equal(Math.round((staffAfter.net_sales - staffBefore.net_sales) * 100), 12000);
  assert.equal(staffAfter.returns_count - staffBefore.returns_count, 1);
  // The shared finance dashboard counts Retail COGS (5080) and Retail stock (1210).
  const financeAfter = await financeDashboard(db);
  assert.equal(Math.round((financeAfter.gross_profit_today - financeBefore.gross_profit_today) * 100), 7000);
  assert.equal(Math.round((financeAfter.inventory_value - financeBefore.inventory_value) * 100), -5000);
});

test('quote names unavailable retail items and sale detail initializes its receipt audit dependency', async () => {
  const item = await product({ stock: 0 });
  const quote = await quoteRetailSale(db, { lines: [{ variant_id: item.variantId, quantity: 2 }] });
  assert.deepEqual(quote.stock_conflicts.map(({ variant_id, requested, available }) => ({ variant_id, requested, available })),
    [{ variant_id: item.variantId, requested: 2, available: 0 }]);
  assert.match(quote.stock_conflicts[0].product_name, /Phase0/);
  assert.doesNotMatch(quote.conflicts[0], /SKU #/);

  const latest = await db.get("SELECT id FROM retail_sales WHERE status='COMPLETED' ORDER BY id DESC LIMIT 1");
  if (!usePostgres) await db.run('DROP TABLE retail_sale_audit');
  const detail = await getRetailSale(db, latest.id);
  assert.equal(detail.id, latest.id);
  if (!usePostgres) assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM retail_sale_audit')).count), 0);
});

test('payment reminders list open Retail credit and record who opened a reminder', async () => {
  const phone = '98' + String(Date.now()).slice(-8);
  const customerId = (await db.run('INSERT INTO customers (name, phone) VALUES (?, ?)', ['Reminder customer', phone])).lastInsertRowid;
  const item = await product({ price: 80, cost: 30, stock: 3 });
  await checkout(item, 1, [{ method: 'credit', amount: 80 }], { customerId });
  const listed = (await listReminderCandidates(db, { q: phone })).find((row) => Number(row.id) === Number(customerId));
  assert.equal(listed.amount_due, 80);
  assert.equal(listed.open_sales, 1);
  assert.equal(listed.reminder_count, 0);
  const reminder = await recordReminder(db, { customerId, message: 'Rs 80 is due', actorId: actor.id });
  assert.equal(reminder.amount_due, 80);
  const after = (await listReminderCandidates(db, { q: phone }))[0];
  assert.equal(after.reminder_count, 1);
  assert.ok(after.last_reminded_at);
  const settled = (await db.run('INSERT INTO customers (name, phone) VALUES (?, ?)', ['No credit customer', '97' + String(Date.now()).slice(-8)])).lastInsertRowid;
  await assert.rejects(() => recordReminder(db, { customerId: settled, message: 'Hello' }), { status: 409 });
});

test('a bundle promotion sells real component lines: stock, COGS and journal stay per item', async () => {
  const a = await product({ price: 100, cost: 40, stock: 3 });
  const b = await product({ price: 60, cost: 20, stock: 3 });
  const promotionId = (await db.run(
    `INSERT INTO promotions (name, offer_type, discount_type, discount_value, scope, quantity_price_amount, minimum_order_amount,
       channels, stackable, priority, auto_apply, is_active) VALUES (?, 'bundle', 'fixed', 0, 'order', 130, 0, ?, 0, 0, 1, 1)`,
    ['Test bundle', JSON.stringify(['retail_pos'])]
  )).lastInsertRowid;
  for (const componentId of [a.id, b.id]) {
    await db.run(`INSERT INTO promotion_targets (promotion_id, target_type, target_id) VALUES (?, 'bundle_component', ?)`, [promotionId, componentId]);
  }
  try {
    const lines = [{ variant_id: a.variantId, quantity: 1 }, { variant_id: b.variantId, quantity: 1 }];
    const held = await holdSale(db, { lines, cashierId: actor.id });
    const sale = await checkoutSale(db, held.id, { lines, payments: [{ method: 'cash', amount: 130, cash_tendered: 130 }],
      cashierId: actor.id, idempotencyKey: `bundle-${held.id}` });
    assert.equal(Number(sale.grand_total), 130);
    assert.equal(Number(sale.cogs_total), 60);
    assert.equal(sale.lines.length, 2);
    assert.equal(await getAvailableStock(db, a.variantId, { locationId: location.id }), 2);
    assert.equal(await getAvailableStock(db, b.variantId, { locationId: location.id }), 2);
    const redemption = await db.get('SELECT discount_amount FROM promotion_redemptions WHERE promotion_id = ? AND retail_sale_id = ?', [promotionId, sale.id]);
    assert.equal(Number(redemption.discount_amount), 30);
    const journal = await db.get(`SELECT SUM(jl.debit) AS debit, SUM(jl.credit) AS credit FROM journal_entries je JOIN journal_lines jl ON jl.journal_id = je.id
      WHERE je.source_type = 'retail_sale' AND je.source_id = ?`, [sale.id]);
    assert.equal(Math.round(Number(journal.debit) * 100), Math.round(Number(journal.credit) * 100));
  } finally {
    await db.run('UPDATE promotions SET is_active = 0 WHERE id = ?', [promotionId]);
  }
});

test('catalog, pricing and online-store schema and search work on local SQLite', async (t) => {
  if (usePostgres) return t.skip('PostgreSQL gets this schema from migrations 104-107');
  await ensureRetailCommerceSchema(db);
  const settings = await db.get('SELECT * FROM retail_online_settings WHERE id=1');
  assert.equal(settings.brand_color, '#20372e');
  for (const [table, column] of [['product_attributes', 'online_filter'], ['products', 'online_title'], ['product_variants', 'merchandising_signature'], ['retail_brands', 'logo_url']]) {
    assert.ok((await db.all(`PRAGMA table_info(${table})`)).some((row) => row.name === column), `${table}.${column}`);
  }
  const item = await product({ price: 250, cost: 90, stock: 4 });
  await db.run('UPDATE products SET online_enabled=1, online_title=?, brand=? WHERE id=?', ['Ruby Hair Clip', 'Kawaii', item.id]);
  const { category_id: categoryId } = await db.get('SELECT category_id FROM products WHERE id=?', [item.id]);
  await db.run('UPDATE product_categories SET online_enabled=1, merchandising_active=1, is_active=1 WHERE id=?', [categoryId]);
  await db.run('UPDATE retail_online_settings SET enabled=1 WHERE id=1');
  try {
    const result = await publicCatalog(db, { query: 'RUBY' });
    const found = result.products.find((row) => Number(row.id) === Number(item.id));
    assert.ok(found, 'search finds the product by online title');
    assert.equal(found.available, 4);
    assert.ok(Array.isArray(result.facets));
  } finally {
    await db.run('UPDATE retail_online_settings SET enabled=0 WHERE id=1');
  }
});

test('bulk product upload makes products with versions and barcodes, all or nothing', async () => {
  await ensureRetailCommerceSchema(db);
  const sample = await planProductImport(db, PRODUCT_CSV_SAMPLE);
  assert.deepEqual(sample.errors, [], 'the downloadable sample imports cleanly');
  assert.equal(sample.products.length, 3);
  assert.deepEqual(sample.products[1].versions.map((v) => v.variant_name), ['Blue / M', 'Blue / L', 'Blue / XL']);

  const tag = Date.now().toString(36);
  const csv = [
    'Name,Category,Price,MRP,Color,Size,Barcode,SKU,Notes',
    `Clip ${tag},Hair ${tag},150,180,Pink,,,,x`,
    `Clip ${tag},Hair ${tag},"1,50",180,Black,,,,x`,
    `Bottle ${tag},,650,,,,BC-${tag},SKU-${tag},`,
  ].join('\n');
  const plan = await planProductImport(db, csv);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.ignored_columns, ['notes']);
  assert.deepEqual(plan.new_categories, [`Hair ${tag}`]);
  assert.deepEqual(plan.counts, { rows: 3, products: 2, versions: 3, skipped: 0 });

  const result = await importProducts(db, csv);
  assert.equal(result.variant_ids.length, 3);
  const rows = await db.all(`SELECT v.id,v.variant_name,v.barcode,v.sku,v.price,v.is_default,p.barcode AS product_barcode,c.name AS category
    FROM product_variants v JOIN products p ON p.id=v.product_id JOIN product_categories c ON c.id=p.category_id WHERE v.id IN (?,?,?) ORDER BY v.id`, result.variant_ids);
  assert.deepEqual(rows.map((r) => r.variant_name), ['Pink', 'Black', 'Standard']);
  // The shop's own codes are 13-digit EAN-13 numbers in the in-store 2xx range.
  assert.ok(/^2\d{12}$/.test(rows[0].barcode) && /^2\d{12}$/.test(rows[1].barcode) && rows[0].barcode !== rows[1].barcode);
  assert.equal(Number(rows[1].price), 150);
  assert.deepEqual(rows.map((r) => Number(r.is_default)), [1, 0, 1]);
  assert.equal(rows[2].barcode, `BC-${tag}`);
  assert.equal(rows[2].product_barcode, `BC-${tag}`);
  assert.equal(rows[2].sku, `SKU-${tag}`);
  assert.equal(rows[0].category, `Hair ${tag}`);
  assert.equal(rows[2].category, 'Uncategorized');
  assert.deepEqual((await getVariantAttributes(db, rows[1].id)).map((a) => [a.attribute, a.value]), [['Colour', 'Black']]);

  const again = await planProductImport(db, csv);
  assert.deepEqual([again.counts.products, again.counts.skipped], [0, 2], 'uploading the same file twice adds nothing');
  await assert.rejects(importProducts(db, csv), /Nothing new/);

  const broken = ['name,price,barcode', `Pen ${tag},20,`, `Cap ${tag},,`, `Mug ${tag},90,BC-${tag}`, `Ink ${tag},5,8.90123E+12`, `Dup ${tag},5,`, `Dup ${tag},6,`].join('\n');
  const checked = await planProductImport(db, broken);
  assert.deepEqual(checked.errors.map((e) => e.line), [3, 4, 5, 6, 7]);
  assert.match(checked.errors[1].message, /already belongs/);
  assert.match(checked.errors[2].message, /Excel/);
  await assert.rejects(importProducts(db, broken), /Row 3: price is empty/);
  assert.ok(!(await db.get('SELECT id FROM products WHERE name=?', [`Pen ${tag}`])), 'a bad row stops the whole upload');
});
