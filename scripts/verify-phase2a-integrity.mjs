/** Read-only economic evidence; never balances or repairs the fixture. */
import fs from 'node:fs';
import Database from '../lib/db/index.js';
import { runRetailReconciliation } from '../lib/retail-reconciliation.js';
import { getInventoryValuation } from '../lib/retail-inventory.js';
import { trialBalance } from '../lib/accounting-reports.js';
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/phase1f_browser_\d+_\d+$/.test(url.pathname)) throw new Error('Disposable local browser fixture required');
const db = Database.getInstance();
try {
  const reconciliation = await runRetailReconciliation(db);
  const trial = await trialBalance(db);
  const valuation = await getInventoryValuation(db);
  const variants = await db.all(`SELECT v.id,v.sku,c.quantity_on_hand,c.average_cost,
    c.carrying_value AS authoritative_value,c.quantity_on_hand*c.average_cost AS informational_average_product,
    c.baseline_value,c.baseline_movement_id,
    (SELECT SUM(m.carrying_value_delta) FROM inventory_movements m WHERE m.variant_id=v.id) AS signed_movement_value
    FROM inventory_costs c JOIN menu_item_variants v ON v.id=c.variant_id ORDER BY v.id`);
  const serialMovements = await db.all(`SELECT m.id,m.variant_id,m.movement_type,m.quantity,m.unit_cost,m.total_cost,m.reference_type,m.reference_id,
    e.return_line_id,e.serial_id FROM inventory_movements m LEFT JOIN retail_return_serial_events e ON m.reference_type='retail_return_serial_event' AND e.id=m.reference_id
    WHERE m.variant_id IN (SELECT id FROM menu_item_variants WHERE tracking_mode='serial') ORDER BY m.id`);
  const missingReturnMovements = await db.all(`SELECT l.id,l.retail_return_id,l.quantity,COUNT(e.id) AS events
    FROM retail_return_lines l JOIN retail_returns r ON r.id=l.retail_return_id
    JOIN menu_item_variants v ON v.id=l.variant_id
    LEFT JOIN retail_return_serial_events e ON e.return_line_id=l.id
    WHERE r.status='POSTED' AND v.tracking_mode='serial' AND l.disposition<>'NO_STOCK_RETURN'
    GROUP BY l.id,l.retail_return_id,l.quantity HAVING COUNT(e.id)<>l.quantity`);
  const result = { reconciliation, trial_balance: trial, valuation, variants, serial_movements: serialMovements, missing_serial_return_events: missingReturnMovements };
  fs.mkdirSync('.commerce-tmp/phase2a', { recursive: true });
  fs.writeFileSync('.commerce-tmp/phase2a/reconciliation.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ reconciled: reconciliation.reconciled, checks: reconciliation.checks,
    projection: reconciliation.inventoryProjection, trial_balanced: trial.balanced,
    valuation: valuation.total, missing_serial_return_events: missingReturnMovements.length }, null, 2));
} finally { await db.close(); }
