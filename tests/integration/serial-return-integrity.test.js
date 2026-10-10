import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../lib/db/index.js';
import { ensureAccountingSchema, accountBalance } from '../../lib/accounting.js';
import { trialBalance } from '../../lib/accounting-reports.js';
import { openBusinessDay } from '../../lib/business-days.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { ensureStandardVariant } from '../../lib/product-variants.js';
import { getDefaultLocation, getInventoryValuation } from '../../lib/retail-inventory.js';
import { createGoodsReceipt, postGoodsReceipt } from '../../lib/retail-purchasing.js';
import { holdSale, checkoutSale } from '../../lib/retail-sales.js';
import { createReturn, postReturn } from '../../lib/retail-returns.js';
import { returnSerial } from '../../lib/retail-serials.js';
import { runRetailReconciliation } from '../../lib/retail-reconciliation.js';

const db = Database.getInstance();
const actor = { id: 1, role: 'admin', full_name: 'Serial integrity verifier' };
const money = value => Math.round(Number(value) * 100) / 100;
test.after(async () => db.close());

test('PostgreSQL: repeated serial returns preserve inventory and accounting on every retry', async t => {
  assert.equal(db.driver, 'postgres');
  await ensureAccountingSchema(db);
  const day = await openBusinessDay(db, { business_date: getNepaliDateString(), opening_cash: 0 }, actor);
  const location = await getDefaultLocation(db);
  const supplierId = (await db.run(`INSERT INTO suppliers(name,normalized_name) VALUES ('Serial gate','serial gate')`)).lastInsertRowid;
  const categoryId = (await db.run(`INSERT INTO product_categories(name,display_order) VALUES ('Serial integrity',1)`)).lastInsertRowid;
  for (const quantity of [1, 2]) await t.test(`${quantity} serial(s) per line, three economic cycles`, async () => {
    const productId = (await db.run(`INSERT INTO products(name,category_id,base_price,is_available) VALUES (?,?,300,1)`, [`Serial gate ${quantity}`, categoryId])).lastInsertRowid;
    const [variant] = await ensureStandardVariant(db, productId, { price: 300, stockUnit: 'pcs' });
    await db.run(`UPDATE product_variants SET tracking_mode='serial' WHERE id=?`, [variant.id]);
    const serials = Array.from({ length: quantity }, (_, i) => `GATE-${quantity}-${i}`);
    const cost = 92.73;
    const openingAsset = money(await accountBalance(db, '1210'));
    const openingCogs = money(await accountBalance(db, '5080'));
    const receipt = await createGoodsReceipt(db, { supplierId, locationId: location.id, paymentMethod: 'credit',
      invoiceNumber: `SERIAL-GATE-${quantity}`, lines: [{ variantId: variant.id, quantityReceived: quantity, unitCost: cost, serialNumbers: serials }] });
    for (let retry = 0; retry < 2; retry++) await postGoodsReceipt(db, receipt.id, { postedBy: actor.id, businessDayId: day.id });
    let previous = null;
    for (let cycle = 1; cycle <= 3; cycle++) {
      const lines = [{ variant_id: variant.id, quantity, serial_numbers: serials }];
      const held = await holdSale(db, { lines, cashierId: actor.id });
      const options = { lines, payments: [{ method: 'cash', amount: 300 * quantity, cash_tendered: 300 * quantity }],
        cashierId: actor.id, idempotencyKey: `serial-gate-sale-${quantity}-${cycle}` };
      const sale = await checkoutSale(db, held.id, options);
      assert.equal((await checkoutSale(db, held.id, options)).id, sale.id);
      assert.equal(money(sale.cogs_total), money(cost * quantity));
      assert.equal(money(await accountBalance(db, '1210')), openingAsset);
      assert.equal(money(await accountBalance(db, '5080')), money(openingCogs + cost * quantity));
      if (previous) {
        await postReturn(db, previous.id, previous.options);
        // Even a low-level retry of an older event must not resurrect sold stock.
        await db.transaction(tx => returnSerial(tx, previous.serialOptions));
      }
      for (const serial of serials) assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number=?`, [serial])).status, 'SOLD');
      const draft = await createReturn(db, { originalSaleId: sale.id, cashierId: actor.id,
        lines: [{ originalSaleLineId: sale.lines[0].id, quantity, condition: 'UNOPENED', disposition: 'RETURN_TO_SELLABLE' }] });
      const returnOptions = { postedBy: actor.id, businessDayId: day.id, refundMethod: 'cash', idempotencyKey: `serial-gate-return-${quantity}-${cycle}` };
      const results = await Promise.all([postReturn(db, draft.id, returnOptions), postReturn(db, draft.id, returnOptions)]);
      assert.equal(results[0].id, results[1].id);
      const returnLine = await db.get(`SELECT id FROM retail_return_lines WHERE retail_return_id=?`, [draft.id]);
      previous = { id: draft.id, options: returnOptions, serialOptions: { serialNumber: serials[0], originalSaleLineId: sale.lines[0].id,
        returnLineId: returnLine.id, disposition: 'IN_STOCK', locationId: location.id, unitCost: cost } };
      await db.transaction(tx => returnSerial(tx, previous.serialOptions));
      for (const serial of serials) assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number=?`, [serial])).status, 'IN_STOCK');
      const movements = await db.get(`SELECT COUNT(*) AS n,SUM(quantity) AS quantity FROM inventory_movements WHERE variant_id=? AND movement_type='CUSTOMER_RETURN'`, [variant.id]);
      assert.equal(Number(movements.n), cycle * quantity);
      assert.equal(Number(movements.quantity), cycle * quantity);
      assert.equal(Number((await db.get(`SELECT SUM(quantity_on_hand) AS n FROM inventory_balances WHERE variant_id=?`, [variant.id])).n), quantity);
      assert.equal(money(await accountBalance(db, '1210')), money(openingAsset + cost * quantity));
      assert.equal(money(await accountBalance(db, '5080')), openingCogs);
      for (const [type, id] of [['retail_sale', sale.id], ['retail_return', draft.id]]) {
        assert.equal(Number((await db.get(`SELECT COUNT(*) AS n FROM journal_entries WHERE source_type=? AND source_id=?`, [type, id])).n), 1);
      }
      const reversal = await db.get(`SELECT SUM(jl.debit) AS debit FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id WHERE je.source_type='retail_return' AND je.source_id=? AND a.code='4011'`, [draft.id]);
      assert.equal(money(reversal.debit), 300 * quantity);
      const reconciliation = await runRetailReconciliation(db);
      assert.equal(reconciliation.reconciled, true, JSON.stringify(reconciliation));
      assert.equal((await getInventoryValuation(db)).total, money(await accountBalance(db, '1210')));
      assert.equal((await trialBalance(db)).balanced, true);
    }
    assert.equal(Number((await db.get(`SELECT COUNT(*) AS n FROM inventory_movements WHERE variant_id=?`, [variant.id])).n), 1 + 3 + 3 * quantity);
  });

  await t.test('fractional moving-average costs must also reconcile after three returns', async () => {
    const productId = (await db.run(`INSERT INTO products(name,category_id,base_price,is_available) VALUES (?,?,300,1)`, ['Fractional serial gate', categoryId])).lastInsertRowid;
    const [variant] = await ensureStandardVariant(db, productId, { price: 300, stockUnit: 'pcs' });
    await db.run(`UPDATE product_variants SET tracking_mode='serial' WHERE id=?`, [variant.id]);
    const serials = Array.from({ length: 11 }, (_, i) => `FRACTIONAL-GATE-${i}`);
    for (const [batch, cost] of [[serials.slice(0, 2), 150], [serials.slice(2), 80]]) {
      const receipt = await createGoodsReceipt(db, { supplierId, locationId: location.id, paymentMethod: 'credit',
        invoiceNumber: `FRACTIONAL-${cost}`, lines: [{ variantId: variant.id, quantityReceived: batch.length, unitCost: cost, serialNumbers: batch }] });
      await postGoodsReceipt(db, receipt.id, { postedBy: actor.id, businessDayId: day.id });
    }
    const evidence = [];
    for (let cycle = 1; cycle <= 3; cycle++) {
      const lines = [{ variant_id: variant.id, quantity: 1, serial_numbers: [serials[0]] }];
      const held = await holdSale(db, { lines, cashierId: actor.id });
      const sale = await checkoutSale(db, held.id, { lines, cashierId: actor.id,
        payments: [{ method: 'cash', amount: 300, cash_tendered: 300 }], idempotencyKey: `fractional-sale-${cycle}` });
      const draft = await createReturn(db, { originalSaleId: sale.id, cashierId: actor.id,
        lines: [{ originalSaleLineId: sale.lines[0].id, quantity: 1, condition: 'UNOPENED', disposition: 'RETURN_TO_SELLABLE' }] });
      await postReturn(db, draft.id, { postedBy: actor.id, refundMethod: 'cash', businessDayId: day.id, idempotencyKey: `fractional-return-${cycle}` });
      const cost = await db.get(`SELECT quantity_on_hand,average_cost,carrying_value AS value FROM inventory_costs WHERE variant_id=?`, [variant.id]);
      assert.equal(Number(cost.value), 1020);
      assert.equal(Number(cost.quantity_on_hand), 11);
      assert.equal((await db.get(`SELECT status FROM inventory_serials WHERE serial_number=?`, [serials[0]])).status, 'IN_STOCK');
      evidence.push({ cycle, ...cost, cogs: sale.cogs_total });
    }
    assert.equal(Number((await db.get(`SELECT COUNT(*) AS n FROM inventory_movements WHERE variant_id=? AND movement_type='CUSTOMER_RETURN'`, [variant.id])).n), 3);
    const reconciliation = await runRetailReconciliation(db);
    assert.equal(reconciliation.inventoryProjection.reconciled, true);
    assert.equal((await trialBalance(db)).balanced, true);
    assert.equal(reconciliation.checks[0].difference, 0, JSON.stringify({ evidence, valuation: reconciliation.checks[0] }));
  });
});
