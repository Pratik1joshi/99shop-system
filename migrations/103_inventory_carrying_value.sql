-- Preserve the pre-upgrade valuation, NOT the GL. Historical differences stay visible.
ALTER TABLE inventory_costs ADD COLUMN IF NOT EXISTS carrying_value NUMERIC(14,2);
ALTER TABLE inventory_costs ADD COLUMN IF NOT EXISTS baseline_value NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_costs ADD COLUMN IF NOT EXISTS baseline_movement_id INTEGER NOT NULL DEFAULT 0;
UPDATE inventory_costs SET carrying_value=ROUND(quantity_on_hand*average_cost,2),
  baseline_value=ROUND(quantity_on_hand*average_cost,2),
  baseline_movement_id=COALESCE((SELECT MAX(id) FROM inventory_movements),0)
  WHERE carrying_value IS NULL;
ALTER TABLE inventory_costs ALTER COLUMN carrying_value SET DEFAULT 0;
ALTER TABLE inventory_costs ALTER COLUMN carrying_value SET NOT NULL;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS carrying_value_delta NUMERIC(14,2);
ALTER TABLE retail_return_lines ADD COLUMN IF NOT EXISTS total_cogs NUMERIC(14,2);

CREATE OR REPLACE VIEW inventory_balance_valuation AS
SELECT b.*,CASE WHEN b.pool_quantity>0 THEN
  (FLOOR(ROUND(COALESCE(c.carrying_value,0)*100,0)*ROUND(b.cumulative_quantity*1000,0)/ROUND(b.pool_quantity*1000,0))
  -FLOOR(ROUND(COALESCE(c.carrying_value,0)*100,0)*ROUND((b.cumulative_quantity-b.quantity_on_hand)*1000,0)/ROUND(b.pool_quantity*1000,0)))/100.0
  ELSE 0 END AS allocated_value
FROM (SELECT ib.*,
  SUM(quantity_on_hand) OVER (PARTITION BY variant_id) AS pool_quantity,
  SUM(quantity_on_hand) OVER (PARTITION BY variant_id ORDER BY location_id,id ROWS UNBOUNDED PRECEDING) AS cumulative_quantity
  FROM inventory_balances ib) b
LEFT JOIN inventory_costs c ON c.variant_id=b.variant_id;
