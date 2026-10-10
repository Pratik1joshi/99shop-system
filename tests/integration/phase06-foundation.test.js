import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../lib/db/index.js';
import { accountBalance, ensureAccountingSchema } from '../../lib/accounting.js';
import { openBusinessDay } from '../../lib/business-days.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { ensureProductVariantsSchema, ensureStandardVariant } from '../../lib/product-variants.js';
import { getDefaultLocation } from '../../lib/retail-inventory.js';
import { createGoodsReceipt, postGoodsReceipt, createPurchaseReturn, postPurchaseReturn } from '../../lib/retail-purchasing.js';
import { holdSale, checkoutSale } from '../../lib/retail-sales.js';
import { createReturn, postReturn } from '../../lib/retail-returns.js';
import { recordManualAdjustment, recordShrinkage } from '../../lib/retail-inventory-adjustments.js';
import { createStockCount, setCountQuantity, completeCounting, postStockCount } from '../../lib/retail-stock-counts.js';
import { issueStoreCredit, getStoreCreditBalance } from '../../lib/retail-store-credit.js';
import { collectRetailCredit, writeOffRetailCredit } from '../../lib/retail-receivables.js';
import { paySupplier } from '../../lib/accounting-suppliers.js';
import { runRetailReconciliation } from '../../lib/retail-reconciliation.js';

const db = Database.getInstance();
const actor = { id: 1, role: 'admin', full_name: 'Phase 0.6 verifier' };
let serial = 0;
const money = (value) => Math.round(Number(value || 0) * 100) / 100;

test.after(async () => { await db.close(); });

async function product({ price, tracking = 'none' }) {
  const category = await db.get(`SELECT id FROM product_categories ORDER BY id LIMIT 1`);
  const id = (await db.run(
    `INSERT INTO products (name,category_id,base_price,is_available) VALUES (?,?,?,1)`,
    [`Gate Product ${++serial}`, category.id, price]
  )).lastInsertRowid;
  const [variant] = await ensureStandardVariant(db, id, { price, stockUnit: 'pcs' });
  await db.run(`UPDATE product_variants SET tracking_mode=? WHERE id=?`, [tracking, variant.id]);
  return { id, variantId: variant.id, price };
}

async function receipt({ supplierId, locationId, item, quantity, cost, invoice, serialNumbers = [] }) {
  const draft = await createGoodsReceipt(db, {
    supplierId, locationId, paymentMethod: 'credit', supplierInvoiceNumber: invoice,
    lines: [{ variantId: item.variantId, quantityReceived: quantity, unitCost: cost, serialNumbers }],
  });
  return postGoodsReceipt(db, draft.id, { postedBy: actor.id });
}

async function sale(item, quantity, payments, { customerId = null, key = null, couponCode = null, serialNumbers = [] } = {}) {
  const lines = [{ variant_id: item.variantId, quantity, serial_numbers: serialNumbers }];
  const held = await holdSale(db, { lines, cashierId: actor.id, customerId });
  return checkoutSale(db, held.id, {
    lines, payments: payments.map((row) => row.method === 'cash' ? { ...row, cash_tendered: row.amount } : row),
    cashierId: actor.id, customerId, allowCredit: true, couponCode,
    idempotencyKey: key || `gate-sale-${held.id}-${Date.now()}`,
  });
}

async function returned(original, quantity, refundMethod, disposition = 'RETURN_TO_SELLABLE') {
  const draft = await createReturn(db, {
    originalSaleId: original.id, cashierId: actor.id,
    lines: [{ originalSaleLineId: original.lines[0].id, quantity, condition: 'UNOPENED', disposition }],
  });
  return postReturn(db, draft.id, {
    postedBy: actor.id, refundMethod, idempotencyKey: `gate-return-${draft.id}`,
  });
}

test('Phase 0.6 fully journaled PostgreSQL foundation matrix', async (t) => {
  assert.equal(db.driver, 'postgres');
  await ensureAccountingSchema(db);
  await ensureProductVariantsSchema(db);
  if (!(await db.get(`SELECT id FROM product_categories LIMIT 1`))) {
    await db.run(`INSERT INTO product_categories(name,display_order) VALUES ('Gate',1)`);
  }
  const day = await openBusinessDay(db, { business_date: getNepaliDateString(), opening_cash: 0 }, actor);
  const location = await getDefaultLocation(db);
  const supplierId = (await db.run(`INSERT INTO suppliers(name,normalized_name) VALUES ('Gate Supplier','gate supplier')`)).lastInsertRowid;
  const customerId = (await db.run(`INSERT INTO customers(name,phone,credit_limit,current_credit) VALUES ('Gate Customer','9800060000',1000,0)`)).lastInsertRowid;

  await t.test('inventory valuation equals Inventory Asset after journal-producing workflows', async () => {
    const item = await product({ price: 30 });
    const first = await receipt({ supplierId, locationId: location.id, item, quantity: 10, cost: 10, invoice: 'GATE-INV-1' });
    await receipt({ supplierId, locationId: location.id, item, quantity: 10, cost: 20, invoice: 'GATE-INV-2' });
    assert.equal(money((await db.get(`SELECT average_cost FROM inventory_costs WHERE variant_id=?`, [item.variantId])).average_cost), 15);

    const creditSale = await sale(item, 4, [{ method: 'credit', amount: 120 }], { customerId });
    await returned(creditSale, 1, 'ar_reduction');
    const cashSale = await sale(item, 2, [{ method: 'cash', amount: 60 }]);
    await returned(cashSale, 2, 'cash');
    await recordShrinkage(db, { variantId: item.variantId, locationId: location.id, quantity: 2, reason: 'Gate loss', createdBy: actor.id, businessDayId: day.id, idempotencyKey: 'gate-loss' });

    const beforePayReturn = await createPurchaseReturn(db, {
      supplierId, goodsReceiptId: first.id, locationId: location.id,
      lines: [{ goodsReceiptLineId: first.lines[0].id, variantId: item.variantId, quantity: 1 }],
    });
    await postPurchaseReturn(db, beforePayReturn.id, { postedBy: actor.id, businessDayId: day.id });
    await paySupplier(db, { supplier_id: supplierId, amount: 90, method: 'cash', created_by: actor.id, external_ref: 'gate-ap-partial' });
    const afterPartialReturn = await createPurchaseReturn(db, {
      supplierId, goodsReceiptId: first.id, locationId: location.id,
      lines: [{ goodsReceiptLineId: first.lines[0].id, variantId: item.variantId, quantity: 1 }],
    });
    await postPurchaseReturn(db, afterPartialReturn.id, { postedBy: actor.id, businessDayId: day.id });

    const reconciliation = await runRetailReconciliation(db);
    const valuation = reconciliation.checks.find((row) => row.name.startsWith('Inventory valuation'));
    assert.deepEqual({ expected: valuation.expected, actual: valuation.actual, difference: valuation.difference, reconciled: valuation.reconciled }, {
      expected: valuation.expected, actual: valuation.expected, difference: 0, reconciled: true,
    });
    assert.equal(reconciliation.inventoryProjection.reconciled, true);
    const illegitimate = await db.get(
      `SELECT COUNT(*) AS n FROM inventory_movements WHERE reference_type IN ('phase0_fixture','phase06_fixture') OR movement_type='OPENING_STOCK'`
    );
    assert.equal(Number(illegitimate.n), 0);

    const payable = money(-(await accountBalance(db, '2010', { supplierId })));
    assert.equal(payable, 190);
    await paySupplier(db, { supplier_id: supplierId, amount: payable, method: 'cash', created_by: actor.id, external_ref: 'gate-ap-final' });
    assert.equal(money(-(await accountBalance(db, '2010', { supplierId }))), 0);
    const supplierTagged = await db.get(`SELECT COALESCE(SUM(jl.credit-jl.debit),0) AS n FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.code='2010' AND jl.supplier_id=?`, [supplierId]);
    assert.equal(money(supplierTagged.n), 0);

    // Keep the credit sale for the AR matrix.
    t.diagnostic(`credit sale ${creditSale.id}`);
    globalThis.__phase06 = { ...(globalThis.__phase06 || {}), creditSale, item, day, location, supplierId, customerId };
  });

  await t.test('retail AR supports partial/full collection, return and write-off without new revenue', async () => {
    const { creditSale } = globalThis.__phase06;
    assert.equal(money((await db.get(`SELECT amount_due FROM retail_sales WHERE id=?`, [creditSale.id])).amount_due), 90, 'partial AR return reduced the original 120 due by 30');
    const revenueBefore = money((await db.get(`SELECT COALESCE(SUM(jl.credit-jl.debit),0) AS n FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.code='4010'`)).n);
    const partial = await collectRetailCredit(db, { saleId: creditSale.id, amount: 20, method: 'cash', actorId: actor.id, externalRef: 'gate-ar-partial' });
    assert.equal(partial.remaining, 70);
    const writeoff = await writeOffRetailCredit(db, { saleId: creditSale.id, amount: 10, reason: 'Approved gate write-off', actorId: actor.id, externalRef: 'gate-ar-writeoff' });
    assert.equal(writeoff.remaining, 60);
    const final = await collectRetailCredit(db, { saleId: creditSale.id, amount: 60, method: 'cash', actorId: actor.id, externalRef: 'gate-ar-final' });
    assert.equal(final.remaining, 0);
    assert.equal(money((await db.get(`SELECT amount_due FROM retail_sales WHERE id=?`, [creditSale.id])).amount_due), 0);
    const revenueAfter = money((await db.get(`SELECT COALESCE(SUM(jl.credit-jl.debit),0) AS n FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.code='4010'`)).n);
    assert.equal(revenueAfter, revenueBefore, 'collections and write-off must not create revenue');
    const arControl = money(await accountBalance(db, '1300'));
    const arTagged = money((await db.get(`SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS n FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.code='1300' AND jl.customer_id IS NOT NULL`)).n);
    assert.equal(arControl, 0);
    assert.equal(arTagged, arControl);
  });

  await t.test('multiple store-credit issues, redemptions, return credit and rollback reconcile', async () => {
    const item = await product({ price: 20 });
    await receipt({ supplierId, locationId: location.id, item, quantity: 10, cost: 5, invoice: 'GATE-SC-STOCK' });
    await issueStoreCredit(db, { customerId, amount: 25, sourceType: 'gate_issue', sourceId: 1, reason: 'Gate issue one', createdBy: actor.id, businessDayId: day.id });
    await issueStoreCredit(db, { customerId, amount: 35, sourceType: 'gate_issue', sourceId: 2, reason: 'Gate issue two', createdBy: actor.id, businessDayId: day.id });
    await sale(item, 1, [{ method: 'store_credit', amount: 20 }], { customerId });
    await sale(item, 1, [{ method: 'store_credit', amount: 15 }, { method: 'cash', amount: 5 }], { customerId });
    const returnSource = await sale(item, 1, [{ method: 'cash', amount: 20 }], { customerId });
    await returned(returnSource, 1, 'store_credit');
    assert.equal(await getStoreCreditBalance(db, customerId), 45);
    await assert.rejects(db.transaction(async (tx) => {
      await issueStoreCredit(tx, { customerId, amount: 99, sourceType: 'gate_rollback', sourceId: 3, reason: 'Must roll back', createdBy: actor.id, businessDayId: day.id });
      throw new Error('injected rollback');
    }), /injected rollback/);
    assert.equal(await getStoreCreditBalance(db, customerId), 45);
    const result = await runRetailReconciliation(db);
    for (const name of ['Store-credit transaction ledger vs customer balance projection', 'Store-credit transaction ledger vs Store Credit Liability']) {
      const row = result.checks.find((entry) => entry.name === name);
      assert.equal(row.reconciled, true, `${name}: ${JSON.stringify(row)}`);
    }
  });

  await t.test('serial checkout and receipt-linked return restore the exact identity', async () => {
    const item = await product({ price: 250, tracking: 'serial' });
    await receipt({ supplierId, locationId: location.id, item, quantity: 1, cost: 150, invoice: 'GATE-SERIAL-STOCK', serialNumbers: ['GATE-SERIAL-001'] });
    const sold = await sale(item, 1, [{ method: 'cash', amount: 250 }], { customerId, serialNumbers: ['GATE-SERIAL-001'] });
    assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number='GATE-SERIAL-001'`)).status, 'SOLD');
    await returned(sold, 1, 'store_credit');
    const restored = await db.get(`SELECT status, sale_line_id, returned_at FROM inventory_serials WHERE serial_number='GATE-SERIAL-001'`);
    assert.equal(restored.status, 'IN_STOCK');
    assert.ok(restored.returned_at);
    assert.equal(Number((await db.get(`SELECT quantity_on_hand FROM inventory_balances WHERE variant_id=? AND location_id=? AND batch_id IS NULL`, [item.variantId, location.id])).quantity_on_hand), 1);
  });

  await t.test('promotion limit, stock adjustment and count posting serialize safely', async () => {
    const promoItem = await product({ price: 20 });
    await receipt({ supplierId, locationId: location.id, item: promoItem, quantity: 2, cost: 5, invoice: 'GATE-PROMO-STOCK' });
    const promo = await db.run(`INSERT INTO promotions(name,discount_type,discount_value,scope,channels,auto_apply,is_active,usage_limit) VALUES ('Gate last use','percent',50,'order','["retail_pos"]',1,1,1)`);
    const lines = [{ variant_id: promoItem.variantId, quantity: 1 }];
    const left = await holdSale(db, { lines, cashierId: actor.id });
    const right = await holdSale(db, { lines, cashierId: actor.id });
    const settle = (held, suffix) => checkoutSale(db, held.id, { lines, payments: [{ method: 'cash', amount: 10, cash_tendered: 10 }], cashierId: actor.id, idempotencyKey: `gate-promo-${suffix}` });
    const promoResults = await Promise.allSettled([settle(left, 'a'), settle(right, 'b')]);
    assert.equal(promoResults.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(Number((await db.get(`SELECT COUNT(*) AS n FROM promotion_redemptions WHERE promotion_id=?`, [promo.lastInsertRowid])).n), 1);

    const adjustItem = await product({ price: 10 });
    await receipt({ supplierId, locationId: location.id, item: adjustItem, quantity: 1, cost: 5, invoice: 'GATE-ADJ-STOCK' });
    const adjustmentResults = await Promise.allSettled(['a', 'b'].map((suffix) => recordManualAdjustment(db, {
      variantId: adjustItem.variantId, locationId: location.id, quantity: -1, reason: 'SHRINKAGE', createdBy: actor.id, businessDayId: day.id, idempotencyKey: `gate-adjust-${suffix}`,
    })));
    assert.equal(adjustmentResults.filter((row) => row.status === 'fulfilled').length, 1);

    const countItem = await product({ price: 10 });
    await receipt({ supplierId, locationId: location.id, item: countItem, quantity: 5, cost: 5, invoice: 'GATE-COUNT-STOCK' });
    const count = await createStockCount(db, { locationId: location.id, countType: 'CYCLE', variantIds: [countItem.variantId], createdBy: actor.id });
    await setCountQuantity(db, count.id, count.lines[0].id, { physicalQuantity: 4, countedBy: actor.id });
    await completeCounting(db, count.id, { completedBy: actor.id });
    const countResults = await Promise.allSettled([postStockCount(db, count.id, { approvedBy: actor.id }), postStockCount(db, count.id, { approvedBy: actor.id })]);
    assert.equal(countResults.filter((row) => row.status === 'fulfilled').length, 2, 'idempotent concurrent post returns the same posted count');
    assert.equal(Number((await db.get(`SELECT COUNT(*) AS n FROM inventory_movements WHERE reference_type='retail_stock_count_post' AND reference_id=?`, [count.lines[0].id])).n), 1);
    assert.equal(Number((await db.get(`SELECT COUNT(*) AS n FROM journal_entries WHERE source_type='retail_stock_count' AND source_id=?`, [count.id])).n), 1);
  });

  const final = await runRetailReconciliation(db);
  assert.equal(final.inventoryProjection.reconciled, true, JSON.stringify(final.inventoryProjection));
  for (const row of final.checks) assert.equal(row.reconciled, true, JSON.stringify(row));
});
