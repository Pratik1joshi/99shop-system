// Read-only allocation of the global SKU pool in stable location/balance order.
export const inventoryValuationView = `CREATE VIEW IF NOT EXISTS inventory_balance_valuation AS
SELECT b.*,CASE WHEN b.pool_quantity>0 THEN
  (FLOOR(ROUND(COALESCE(c.carrying_value,0)*100,0)*ROUND(b.cumulative_quantity*1000,0)/ROUND(b.pool_quantity*1000,0))
  -FLOOR(ROUND(COALESCE(c.carrying_value,0)*100,0)*ROUND((b.cumulative_quantity-b.quantity_on_hand)*1000,0)/ROUND(b.pool_quantity*1000,0)))/100.0
  ELSE 0 END AS allocated_value
FROM (SELECT ib.*,
  SUM(quantity_on_hand) OVER (PARTITION BY variant_id) AS pool_quantity,
  SUM(quantity_on_hand) OVER (PARTITION BY variant_id ORDER BY location_id,id ROWS UNBOUNDED PRECEDING) AS cumulative_quantity
  FROM inventory_balances ib) b
LEFT JOIN inventory_costs c ON c.variant_id=b.variant_id`;
