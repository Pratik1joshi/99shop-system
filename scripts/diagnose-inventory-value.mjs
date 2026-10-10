/** SELECT-only diagnostic. No schema creation, backfill, or repair. */
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const rows = (await client.query(`SELECT v.sku,b.location_id,l.name AS location,b.quantity_on_hand,
    c.average_cost,c.carrying_value AS sku_carrying_value,b.allocated_value AS location_allocated_value,
    c.baseline_value,c.baseline_movement_id,
    c.baseline_value+COALESCE((SELECT SUM(m.carrying_value_delta) FROM inventory_movements m WHERE m.variant_id=v.id AND m.id>c.baseline_movement_id),0) AS monetary_movement_projection,
    c.carrying_value-c.baseline_value-COALESCE((SELECT SUM(m.carrying_value_delta) FROM inventory_movements m WHERE m.variant_id=v.id AND m.id>c.baseline_movement_id),0) AS monetary_projection_difference,
    (SELECT COUNT(*) FROM inventory_movements m WHERE m.variant_id=v.id AND m.carrying_value_delta IS NULL) AS historical_unvalued_movements
    FROM inventory_costs c JOIN menu_item_variants v ON v.id=c.variant_id
    LEFT JOIN inventory_balance_valuation b ON b.variant_id=v.id
    LEFT JOIN inventory_locations l ON l.id=b.location_id ORDER BY v.id,b.location_id,b.id`)).rows;
  const control = (await client.query(`SELECT (SELECT COALESCE(SUM(carrying_value),0) FROM inventory_costs) AS carrying_value,
    (SELECT COALESCE(SUM(jl.debit-jl.credit),0) FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE a.code='1210') AS inventory_asset`)).rows[0];
  console.log(JSON.stringify({ rows, control, difference: (Number(control.carrying_value)-Number(control.inventory_asset)).toFixed(2),
    gl_attribution: 'Inventory GL is a document-level control. Mixed-SKU journal lines do not support factual per-location GL attribution; no inferred allocation is presented.' }, null, 2));
  await client.query('ROLLBACK');
} finally { await client.end(); }
