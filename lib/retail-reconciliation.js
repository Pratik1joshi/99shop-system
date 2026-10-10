/** Read-only Phase 0 controls. These checks report; they never repair. */
import { ensureAccountingSchema, accountBalance } from '@/lib/accounting.js';
import { ensureRetailInventorySchema } from '@/lib/retail-inventory.js';
import { ensureStoreCreditSchema } from '@/lib/retail-store-credit.js';

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const check = (name, expected, actual, detail = null) => {
  const difference = r2(Number(actual) - Number(expected));
  return { name, expected: r2(expected), actual: r2(actual), difference, reconciled: Math.abs(difference) < 0.01, ...(detail ? { detail } : {}) };
};

export async function reconcileInventoryProjection(db) {
  await ensureRetailInventorySchema(db);
  const rows = await db.all(
    `SELECT keys.variant_id,keys.location_id,keys.batch_key,
            COALESCE(m.ledger_quantity,0) AS ledger_quantity,COALESCE(b.balance_quantity,0) AS balance_quantity
       FROM (
         SELECT variant_id,location_id,COALESCE(batch_id,-1) AS batch_key FROM inventory_movements
         UNION SELECT variant_id,location_id,COALESCE(batch_id,-1) FROM inventory_balances
       ) keys
       LEFT JOIN (SELECT variant_id,location_id,COALESCE(batch_id,-1) AS batch_key,SUM(quantity) AS ledger_quantity
                    FROM inventory_movements GROUP BY variant_id,location_id,COALESCE(batch_id,-1)) m
         ON m.variant_id=keys.variant_id AND m.location_id=keys.location_id AND m.batch_key=keys.batch_key
       LEFT JOIN (SELECT variant_id,location_id,COALESCE(batch_id,-1) AS batch_key,SUM(quantity_on_hand) AS balance_quantity
                    FROM inventory_balances GROUP BY variant_id,location_id,COALESCE(batch_id,-1)) b
         ON b.variant_id=keys.variant_id AND b.location_id=keys.location_id AND b.batch_key=keys.batch_key
      ORDER BY keys.variant_id,keys.location_id,keys.batch_key`
  );
  const differences = rows.map((row) => ({ ...row, difference: r2(n(row.balance_quantity) - n(row.ledger_quantity)) })).filter((row) => Math.abs(row.difference) >= 0.001);
  return { name: 'Inventory balance projection vs movement ledger', reconciled: differences.length === 0, checked: rows.length, differences };
}

function n(value) { return Number(value) || 0; }

export async function runRetailReconciliation(db) {
  await ensureAccountingSchema(db);
  await ensureRetailInventorySchema(db);
  await ensureStoreCreditSchema(db);
  const inventoryProjection = await reconcileInventoryProjection(db);
  const valuation = await db.get(`SELECT COALESCE(SUM(carrying_value),0) AS total FROM inventory_costs`);
  const monetaryRows = await db.all(`SELECT c.variant_id,c.carrying_value,c.quantity_on_hand,
    (SELECT COALESCE(SUM(b.quantity_on_hand),0) FROM inventory_balances b WHERE b.variant_id=c.variant_id) AS physical_quantity,
    c.baseline_value+COALESCE(SUM(m.carrying_value_delta),0) AS movement_value
    FROM inventory_costs c LEFT JOIN inventory_movements m ON m.variant_id=c.variant_id AND m.id>c.baseline_movement_id
    GROUP BY c.variant_id,c.carrying_value,c.baseline_value,c.quantity_on_hand`);
  const monetaryDifferences = monetaryRows.map(row => ({ ...row, difference: r2(n(row.carrying_value)-n(row.movement_value)),
    quantity_difference: Math.round((n(row.quantity_on_hand)-n(row.physical_quantity))*1000)/1000 })).filter(row => row.difference !== 0 || row.quantity_difference !== 0);
  const inventoryValueProjection = { reconciled: monetaryDifferences.length === 0, checked: monetaryRows.length, differences: monetaryDifferences };
  const inventoryAsset = await accountBalance(db, '1210');

  const sales = await db.get(`SELECT COALESCE(SUM(grand_total-tax_amount),0) AS revenue,COALESCE(SUM(tax_amount),0) AS tax,COALESCE(SUM(cogs_total),0) AS cogs FROM retail_sales WHERE status='COMPLETED'`);
  const posted = await db.get(
    `SELECT COALESCE(SUM(CASE WHEN a.code='4010' THEN jl.credit-jl.debit ELSE 0 END),0) AS revenue,
            COALESCE(SUM(CASE WHEN a.code='2020' THEN jl.credit-jl.debit ELSE 0 END),0) AS tax,
            COALESCE(SUM(CASE WHEN a.code='5080' THEN jl.debit-jl.credit ELSE 0 END),0) AS cogs
       FROM journal_entries je JOIN journal_lines jl ON jl.journal_id=je.id JOIN accounts a ON a.id=jl.account_id
      WHERE je.source_type='retail_sale'`
  );
  const arControl = n(await accountBalance(db, '1300'));
  const arTagged = await db.get(`SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS total FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.code='1300' AND jl.customer_id IS NOT NULL`);
  const retailArProjection = await db.get(`SELECT COALESCE(SUM(amount_due),0) AS total FROM retail_sales WHERE status='COMPLETED'`);
  const retailArPosted = await db.get(`SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS total FROM journal_lines jl
    JOIN accounts a ON a.id=jl.account_id JOIN journal_entries je ON je.id=jl.journal_id
    WHERE a.code='1300' AND je.source_type IN ('retail_sale','retail_return','retail_credit_collection','retail_credit_writeoff')`);
  const apControl = -n(await accountBalance(db, '2010'));
  const apTagged = await db.get(`SELECT COALESCE(SUM(jl.credit-jl.debit),0) AS total FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.code='2010' AND jl.supplier_id IS NOT NULL`);
  // amount is already signed by the ledger writer: ISSUE is positive,
  // REDEEM is negative, and ADJUSTMENT/REVERSAL carry their own sign.
  const storeTransactions = await db.get(`SELECT COALESCE(SUM(amount),0) AS total FROM store_credit_transactions`);
  const storeCustomers = await db.get(`SELECT COALESCE(SUM(store_credit_balance),0) AS total FROM customers`);
  const storeLiability = -n(await accountBalance(db, '2030'));

  const checks = [
    check('Inventory valuation vs inventory asset account', n(valuation?.total), inventoryAsset),
    check('Retail revenue vs sales journal postings', n(sales?.revenue), n(posted?.revenue)),
    check('Retail VAT vs VAT journal postings', n(sales?.tax), n(posted?.tax)),
    check('Retail COGS vs COGS journal postings', n(sales?.cogs), n(posted?.cogs)),
    check('Customer-tagged credit subledger vs Accounts Receivable', arControl, n(arTagged?.total)),
    check('Retail sale receivables vs Retail AR journal', n(retailArProjection?.total), n(retailArPosted?.total)),
    check('Supplier-tagged payable subledger vs Accounts Payable', apControl, n(apTagged?.total)),
    check('Store-credit transaction ledger vs customer balance projection', n(storeTransactions?.total), n(storeCustomers?.total)),
    check('Store-credit transaction ledger vs Store Credit Liability', n(storeTransactions?.total), storeLiability),
  ];
  return { reconciled: inventoryProjection.reconciled && inventoryValueProjection.reconciled && checks.every((row) => row.reconciled), generated_at: new Date().toISOString(), inventoryProjection, inventoryValueProjection, checks };
}
