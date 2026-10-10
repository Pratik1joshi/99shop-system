-- Remove the restaurant schema. The shop runs on the retail tables
-- (retail_sales, goods_receipts, inventory_balances, ...); nothing reads the
-- tables below any more. CASCADE also drops the foreign keys that retail and
-- shared tables still carried towards them.

DROP TABLE IF EXISTS
  bill_audit,
  bill_corrections,
  bill_payment_allocations,
  bill_payments,
  bill_revisions,
  bills,
  cancellation_verifications,
  delivery_executives,
  inquiries,
  inventory_categories,
  inventory_items,
  kot_items,
  kots,
  menu_combo_items,
  menu_combos,
  order_items,
  orders,
  pos_audit_log,
  purchase_change_audit,
  purchase_items,
  purchases,
  recipe_items,
  recipes,
  reservations,
  review_answers,
  review_questions,
  review_forms,
  customer_reviews,
  stock_items,
  stock_movements,
  table_floors,
  table_types,
  tables,
  unit_conversions,
  waiter_requests,
  wastage_log
CASCADE;

-- Columns that only ever pointed at the tables above.
ALTER TABLE customer_ledger DROP COLUMN IF EXISTS bill_id;
ALTER TABLE promotion_redemptions DROP COLUMN IF EXISTS order_id;
ALTER TABLE promotion_redemptions DROP COLUMN IF EXISTS bill_id;
ALTER TABLE inventory_batches DROP COLUMN IF EXISTS purchase_id;

-- Food-menu attributes and the ingredient-stock link on products.
ALTER TABLE menu_items DROP COLUMN IF EXISTS preparation_time;
ALTER TABLE menu_items DROP COLUMN IF EXISTS is_vegetarian;
ALTER TABLE menu_items DROP COLUMN IF EXISTS is_vegan;
ALTER TABLE menu_items DROP COLUMN IF EXISTS is_spicy;
ALTER TABLE menu_items DROP COLUMN IF EXISTS spice_level;
ALTER TABLE menu_items DROP COLUMN IF EXISTS calories;
ALTER TABLE menu_items DROP COLUMN IF EXISTS allergens;
ALTER TABLE menu_items DROP COLUMN IF EXISTS stock_usage;
ALTER TABLE menu_items DROP COLUMN IF EXISTS is_combo;
ALTER TABLE menu_item_variants DROP COLUMN IF EXISTS inventory_item_id;
ALTER TABLE menu_item_variants DROP COLUMN IF EXISTS pos_stock_visible;
ALTER TABLE menu_item_variants DROP COLUMN IF EXISTS stock_quantity;

-- The periodic Inventory (1200) and Purchases expense (5010) accounts belong
-- to the old purchase model. Switch them off where nothing was ever posted.
UPDATE accounts SET is_active = 0
 WHERE code IN ('1200', '5010')
   AND NOT EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.account_id = accounts.id);

UPDATE accounts SET name = 'Inventory Loss / Damage', subtype = 'inventory_loss'
 WHERE code = '5040' AND name = 'Wastage / Inventory Loss';
