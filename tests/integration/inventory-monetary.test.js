import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../lib/db/index.js';
import { accountBalance, ensureAccountingSchema } from '../../lib/accounting.js';
import { trialBalance } from '../../lib/accounting-reports.js';
import { openBusinessDay } from '../../lib/business-days.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { ensureStandardVariant } from '../../lib/menu-variants.js';
import { getDefaultLocation, createLocation } from '../../lib/retail-inventory.js';
import { createGoodsReceipt, postGoodsReceipt, createPurchaseReturn, postPurchaseReturn } from '../../lib/retail-purchasing.js';
import { holdSale, checkoutSale } from '../../lib/retail-sales.js';
import { createReturn, postReturn } from '../../lib/retail-returns.js';
import { recordDamage, recordExpiry, recordShrinkage, recordTester, recordSample, recordInternalUse, recordManualAdjustment } from '../../lib/retail-inventory-adjustments.js';
import { createTransfer, dispatchTransfer, receiveTransfer } from '../../lib/retail-transfers.js';
import { createStockCount, setCountQuantity, completeCounting, postStockCount } from '../../lib/retail-stock-counts.js';
import { runRetailReconciliation } from '../../lib/retail-reconciliation.js';
const db = Database.getInstance();
const actor = { id: 1, role: 'admin', full_name: 'Money verifier' };
let location, supplierId, categoryId, day, sequence = 0;
const r2 = value => Math.round(Number(value) * 100) / 100;
test.after(async () => db.close());
async function check(label) {
  const result = await runRetailReconciliation(db);
  assert.equal(result.reconciled, true, `${label}: ${JSON.stringify(result)}`);
  assert.equal((await trialBalance(db)).balanced, true, label);
  const values = await db.get(`SELECT SUM(carrying_value) AS value FROM inventory_costs`);
  const breakdown = await db.get(`SELECT SUM(allocated_value) AS value FROM inventory_balance_valuation`);
  assert.equal(r2(breakdown.value), r2(values.value), `${label}: breakdown conservation`);
  const serialMismatch = await db.all(`SELECT v.id FROM menu_item_variants v WHERE v.tracking_mode='serial'
    AND (SELECT COUNT(*) FROM inventory_serials s WHERE s.variant_id=v.id AND s.status IN ('IN_STOCK','QUARANTINE'))
      <> COALESCE((SELECT SUM(b.quantity_on_hand) FROM inventory_balances b WHERE b.variant_id=v.id),0)`);
  assert.equal(serialMismatch.length, 0, `${label}: exact serial state projection`);
}
async function item(tracking = 'none') {
  const productId = (await db.run(`INSERT INTO menu_items(name,category_id,base_price,is_available) VALUES (?,?,300,1)`, [`Money ${++sequence}`, categoryId])).lastInsertRowid;
  const [variant] = await ensureStandardVariant(db, productId, { price: 300, stockUnit: 'pcs' });
  await db.run(`UPDATE menu_item_variants SET tracking_mode=? WHERE id=?`, [tracking, variant.id]);
  return variant.id;
}
async function receipt(variantId, quantity, cost, extra = {}) {
  const draft = await createGoodsReceipt(db, { supplierId, locationId: location.id, paymentMethod: 'credit', invoiceNumber: `MONEY-${++sequence}`,
    lines: [{ variantId, quantityReceived: quantity, unitCost: cost, ...extra }] });
  const posted = await postGoodsReceipt(db, draft.id, { postedBy: actor.id, businessDayId: day.id });
  await postGoodsReceipt(db, draft.id, { postedBy: actor.id, businessDayId: day.id });
  await check('receipt/retry');
  return posted;
}
async function sell(variantId, quantity) {
  const lines = [{ variant_id: variantId, quantity }];
  const held = await holdSale(db, { lines, cashierId: actor.id });
  const options = { lines, cashierId: actor.id, payments: [{ method: 'cash', amount: quantity * 300, cash_tendered: quantity * 300 }], idempotencyKey: `money-sale-${held.id}` };
  const sale = await checkoutSale(db, held.id, options);
  await checkoutSale(db, held.id, options); await check('sale/retry'); return sale;
}
async function refund(sale, quantity) {
  const draft = await createReturn(db, { originalSaleId: sale.id, cashierId: actor.id,
    lines: [{ originalSaleLineId: sale.lines[0].id, quantity, condition: 'UNOPENED', disposition: 'RETURN_TO_SELLABLE' }] });
  const opts = { postedBy: actor.id, refundMethod: 'cash', idempotencyKey: `money-return-${draft.id}` };
  const result = await postReturn(db, draft.id, opts); await postReturn(db, draft.id, opts);
  await check('return/retry'); return result;
}
test('PostgreSQL carrying-value property matrix', async t => {
  assert.equal(db.driver, 'postgres'); await ensureAccountingSchema(db);
  day = await openBusinessDay(db, { business_date: getNepaliDateString(), opening_cash: 0 }, actor);
  location = await getDefaultLocation(db);
  supplierId = (await db.run(`INSERT INTO suppliers(name,normalized_name) VALUES ('Money supplier','money supplier')`)).lastInsertRowid;
  categoryId = (await db.run(`INSERT INTO menu_categories(name,display_order) VALUES ('Money',1)`)).lastInsertRowid;
  await t.test('100 / 3 multi-quantity sale and three partial returns conserve historical cents', async () => {
    const id = await item(); await receipt(id, 3, 33.33, { taxAmount: 0.01 });
    const sale = await sell(id, 3); assert.equal(Number(sale.total_cost ?? sale.cogs_total), 100);
    const costs = [];
    for (let i = 0; i < 3; i++) costs.push(Number((await refund(sale, 1)).lines[0].total_cogs));
    assert.equal(r2(costs.reduce((a,b) => a+b)), 100);
    assert.equal(Number((await db.get(`SELECT carrying_value FROM inventory_costs WHERE variant_id=?`, [id])).carrying_value), 100);
  });
  await t.test('FEFO loss across batches posts every monetary movement', async () => {
    const id = await item('batch'); await receipt(id, 3, 33.33, { taxAmount: 0.01, batches: [1,2,3].map(i => ({ batchNumber: `MONEY-B-${i}`, quantity: 1, expiryDate: '2099-01-01' })) });
    const opts = { variantId: id, quantity: 2, locationId: location.id, reason: 'Damaged', createdBy: actor.id, businessDayId: day.id, idempotencyKey: 'money-batch-damage' };
    await recordDamage(db, opts); await recordDamage(db, opts); await check('batch damage/retry');
  });
  await t.test('all write-off accounts exhaust every cent; converted receipt uses net inventory amount', async () => {
    const id = await item(); await receipt(id, 2, 100, { conversionFactor: 3, discountAmount: 0.01 });
    assert.equal(Number((await db.get(`SELECT carrying_value FROM inventory_costs WHERE variant_id=?`, [id])).carrying_value), 199.99);
    for (const [index, action] of [recordDamage,recordExpiry,recordShrinkage,recordTester,recordSample,recordInternalUse].entries()) {
      const opts = { variantId: id, locationId: location.id, quantity: 1, reason: 'Write-off property', createdBy: actor.id, businessDayId: day.id, idempotencyKey: `writeoff-${index}` };
      await action(db, opts); await action(db, opts); await check(`writeoff ${index}`);
    }
    const final = await db.get(`SELECT carrying_value,quantity_on_hand FROM inventory_costs WHERE variant_id=?`, [id]);
    assert.equal(Number(final.carrying_value), 0); assert.equal(Number(final.quantity_on_hand), 0);
  });
  await t.test('two-serial supplier return preserves PPV and issues both identities', async () => {
    const id = await item('serial'); const serials = ['MONEY-S1','MONEY-S2'];
    const received = await receipt(id, 2, 17.17, { serialNumbers: serials });
    await receipt(id, 1, 19.19, { serialNumbers: ['MONEY-S3'] });
    const draft = await createPurchaseReturn(db, { supplierId, goodsReceiptId: received.id, locationId: location.id,
      lines: [{ goodsReceiptLineId: received.lines[0].id, variantId: id, quantity: 2, serialNumbers: serials }] });
    await postPurchaseReturn(db, draft.id, { postedBy: actor.id }); await postPurchaseReturn(db, draft.id, { postedBy: actor.id });
    await check('supplier return/retry');
    assert.equal(Number((await db.get(`SELECT quantity_on_hand FROM inventory_costs WHERE variant_id=?`, [id])).quantity_on_hand), 1);
  });
  await t.test('fractional transfer and count gain/loss preserve monetary totals', async () => {
    const id = await item(); await receipt(id, 3, 33.33, { taxAmount: 0.01 });
    const destination = await createLocation(db, { name: 'Money destination', code: 'MONEY-DEST' });
    const before = await accountBalance(db, '1210');
    const transfer = await createTransfer(db, { sourceLocationId: location.id, destinationLocationId: destination.id, requestedBy: actor.id, lines: [{ variantId: id, quantity: 2 }] });
    await dispatchTransfer(db, transfer.id, { dispatchedBy: actor.id }); await dispatchTransfer(db, transfer.id, { dispatchedBy: actor.id });
    await receiveTransfer(db, transfer.id, { receivedBy: actor.id }); await receiveTransfer(db, transfer.id, { receivedBy: actor.id });
    assert.equal(await accountBalance(db, '1210'), before); await check('transfer/retry');
    for (const quantity of [1, 2]) {
      const count = await createStockCount(db, { locationId: destination.id, countType: 'CYCLE', variantIds: [id], createdBy: actor.id });
      await setCountQuantity(db, count.id, count.lines[0].id, { physicalQuantity: quantity, countedBy: actor.id });
      await completeCounting(db, count.id, { completedBy: actor.id });
      await postStockCount(db, count.id, { approvedBy: actor.id }); await postStockCount(db, count.id, { approvedBy: actor.id }); await check('count/retry');
    }
  });
  await t.test('seeded repeated receipts/sales/partial returns and expense allocations', async () => {
    let seed = 20260926;
    const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed; };
    const id = await item();
    for (let cycle = 0; cycle < 12; cycle++) {
      const cost = (random() % 999 + 1) / 100;
      await receipt(id, 3, cost, { discountAmount: 0.01 });
      const before = Number((await db.get(`SELECT carrying_value FROM inventory_costs WHERE variant_id=?`, [id])).carrying_value);
      const sale = await sell(id, 3); await refund(sale, 1); await refund(sale, 2);
      assert.equal(Number((await db.get(`SELECT carrying_value FROM inventory_costs WHERE variant_id=?`, [id])).carrying_value), before);
      const action = [recordShrinkage,recordTester,recordSample,recordInternalUse][(random()>>>16)%4];
      const opts = { variantId: id, quantity: 1, locationId: location.id, reason: 'Seeded consumption', createdBy: actor.id, businessDayId: day.id, idempotencyKey: `seed-loss-${cycle}` };
      await action(db, opts); await action(db, opts); await check(`seed ${cycle}`);
      await recordManualAdjustment(db, { ...opts, quantity: 1, reason: 'FOUND_STOCK', idempotencyKey: `seed-gain-${cycle}` }); await check(`gain ${cycle}`);
    }
  });
});
