-- =====================================================================
-- 99 Shop by Shahana — production seed (Postgres)
-- Run AFTER deploy/production_schema.sql on a fresh database.
--
-- Loads, idempotently (safe to re-run):
--   1. Chart of Accounts + default cash drawer / bank
--   2. Shop settings (99 Shop branding, VAT/service, receipt)
--   3. First admin — login PIN 984898 (change after first sign-in)
--   4. Table floors, table types (categories) and tables T-01..T-12
--   5. Unit conversions (kg/g, l/ml, dozen/pcs, packet/pcs)
--   6. Full real menu: 15 categories, 178 items (from the live site's menu
--      list). No photos yet (image_url NULL — add via Admin -> Products).
--      "Option" items are seeded at their single listed base price; the
--      source list flags which items have options but never says what the
--      options actually are, so no variant rows were invented. Add real
--      variants later via Admin -> Products, or supply the option names/
--      price deltas and this can be generated.
--   7. Inventory categories + ingredient master (opening stock 0 — the
--      client fills real stock later)
--   8. An empty recipe shell for every menu item (no ingredient lines —
--      this menu's dish compositions weren't supplied, so none were
--      invented; fill recipes in later via Admin -> Recipes so stock
--      auto-deducts on sale)
--   9. schema_migrations markers 001..038 so `npm run db:migrate` is a
--      no-op afterwards (and only applies anything newer than this)
--
-- Markers used for idempotency:
--   recipes.prep_notes      = '__dsp_seed__'
--   inventory_items.notes   = 'DSP seed ingredient'
--   unit_conversions.note   = '__dsp_seed__'
-- =====================================================================

BEGIN;

-- pgcrypto is needed to hash the admin PIN below (bcrypt-compatible $2a$).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================ 1. ACCOUNTS
INSERT INTO accounts (code, name, type, subtype, is_system) VALUES
  ('1000','Assets','asset',NULL,1),
  ('1010','Cash on Hand','asset','cash',1),
  ('1020','Bank','asset','bank',1),
  ('1100','Card Clearing','asset','clearing',1),
  ('1110','eSewa Clearing','asset','clearing',1),
  ('1120','Khalti Clearing','asset','clearing',1),
  ('1130','QR / Fonepay Clearing','asset','clearing',1),
  ('1140','Online Clearing','asset','clearing',1),
  ('1200','Inventory','asset','inventory',1),
  ('1300','Accounts Receivable','asset','receivable',1),
  ('2000','Liabilities','liability',NULL,1),
  ('2010','Accounts Payable','liability','payable',1),
  ('2020','VAT / Tax Payable','liability','tax_payable',1),
  ('3000','Equity','equity',NULL,1),
  ('3010','Owner''s Equity','equity',NULL,1),
  ('3020','Opening Balance Equity','equity',NULL,1),
  ('4000','Income','income',NULL,1),
  ('4010','Sales Revenue','income','sales',1),
  ('4020','Other Income','income',NULL,1),
  ('5000','Expenses','expense',NULL,1),
  ('5010','Purchases / COGS','expense','cogs',1),
  ('5020','Operating Expenses','expense','operating',1),
  ('5030','Payroll','expense','payroll',1),
  ('5040','Wastage / Inventory Loss','expense','wastage',1),
  ('5050','Payment Processing Fees','expense','fees',1),
  ('5060','Cash Over / Short','expense','variance',1)
ON CONFLICT (code) DO NOTHING;

UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='1000') WHERE code IN ('1010','1020','1100','1110','1120','1130','1140','1200','1300') AND parent_id IS NULL;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='2000') WHERE code IN ('2010','2020') AND parent_id IS NULL;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='3000') WHERE code IN ('3010','3020') AND parent_id IS NULL;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='4000') WHERE code IN ('4010','4020') AND parent_id IS NULL;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code='5000') WHERE code IN ('5010','5020','5030','5040','5050','5060') AND parent_id IS NULL;

INSERT INTO cash_drawers (name) SELECT 'Main Drawer' WHERE NOT EXISTS (SELECT 1 FROM cash_drawers);
INSERT INTO bank_accounts (name, account_id)
  SELECT 'Primary Bank', (SELECT id FROM accounts WHERE code='1020') WHERE NOT EXISTS (SELECT 1 FROM bank_accounts);

-- ============================================================ 2. SETTINGS
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('restaurant_name','99 Shop by Shahana'),
  ('restaurant_address','Surkhet, Nepal'),
  ('restaurant_phone','+977 976-789-6814'),
  ('restaurant_email',''),
  ('vat_number',''),
  ('pan_number',''),
  ('vat_percentage','0'),
  ('service_charge_percentage','0'),
  ('currency','NPR'),
  ('receipt_footer','Thank you for shopping at 99 Shop!'),
  ('receipt_paper_size','80'),
  ('website','https://pos.example.com'),
  ('qr_ordering_enabled','true'),
  ('bank_qr_image',''),
  ('esewa_qr_image',''),
  ('reservation_hold_minutes','30'),
  ('reservation_grace_minutes','20'),
  ('reservation_dining_minutes','90'),
  ('reservation_cleaning_minutes','10'),
  ('reservation_auto_cancel_minutes','20'),
  ('reservation_min_lead_minutes','60')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================== 3. ADMIN
-- Login is PIN-based. Seeded PIN = 984898. CHANGE after first sign-in
-- (must_change_password forces a reset on first login).
INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
VALUES ('admin', crypt('984898', gen_salt('bf', 12)), 'Restaurant Admin', 'admin', 1, 1)
ON CONFLICT (username) DO NOTHING;

-- ============================================================== 4. FLOORS
INSERT INTO table_floors (name, normalized_name, sort_order) VALUES
  ('Ground',  'ground',  1),
  ('First',   'first',   2),
  ('Rooftop', 'rooftop', 3),
  ('Outdoor', 'outdoor', 4)
ON CONFLICT (normalized_name) DO NOTHING;

-- ---- table types (a.k.a. table categories) ----
INSERT INTO table_types (name, normalized_name, color, default_capacity) VALUES
  ('Regular', 'regular', '#3b82f6', 4),
  ('VIP',     'vip',     '#a855f7', 6),
  ('Family',  'family',  '#22c55e', 6),
  ('Couple',  'couple',  '#ec4899', 2),
  ('Outdoor', 'outdoor', '#f59e0b', 4),
  ('Counter', 'counter', '#64748b', 2)
ON CONFLICT (normalized_name) DO NOTHING;

-- ---- tables T-01..T-12 ----
INSERT INTO tables (table_number, capacity, status, floor, section, table_type, is_active)
SELECT v.num, v.cap, 'available', v.floor, v.section, v.ttype, 1
FROM (VALUES
  ('T-01', 2, 'Ground',  'Main',    'couple'),
  ('T-02', 2, 'Ground',  'Main',    'couple'),
  ('T-03', 4, 'Ground',  'Main',    'regular'),
  ('T-04', 4, 'Ground',  'Main',    'regular'),
  ('T-05', 4, 'Ground',  'Main',    'regular'),
  ('T-06', 6, 'Ground',  'Main',    'family'),
  ('T-07', 4, 'First',   'Hall',    'regular'),
  ('T-08', 4, 'First',   'Hall',    'regular'),
  ('T-09', 6, 'First',   'Hall',    'family'),
  ('T-10', 6, 'First',   'VIP',     'vip'),
  ('T-11', 4, 'Rooftop', 'Terrace', 'outdoor'),
  ('T-12', 4, 'Rooftop', 'Terrace', 'outdoor')
) AS v(num, cap, floor, section, ttype)
WHERE NOT EXISTS (SELECT 1 FROM tables t WHERE t.table_number = v.num);

-- ==================================================== 5. UNIT CONVERSIONS
INSERT INTO unit_conversions (from_unit, to_unit, factor, note) VALUES
  ('kg',     'g',   1000,  '__dsp_seed__'),
  ('g',      'kg',  0.001, '__dsp_seed__'),
  ('l',      'ml',  1000,  '__dsp_seed__'),
  ('ml',     'l',   0.001, '__dsp_seed__'),
  ('dozen',  'pcs', 12,    '__dsp_seed__'),
  ('packet', 'pcs', 1,     '__dsp_seed__')
ON CONFLICT (from_unit, to_unit) DO NOTHING;

-- ================================================= 6. MENU CATEGORIES (15)
INSERT INTO menu_categories (name, display_order)
SELECT v.name, v.ord FROM (VALUES
  ('Hot Beverages', 1),
  ('Rice & Noodles', 2),
  ('Momo Specials', 3),
  ('Vegetarian Choices', 4),
  ('Soup', 5),
  ('Breakfast Menu', 6),
  ('Mutton Starters', 7),
  ('Chicken Starters', 8),
  ('Fast Food Menu', 9),
  ('KTM Special Food', 10),
  ('Nepali Thali', 11),
  ('Beverages', 12),
  ('Beer', 13),
  ('Domestic Hard Drinks', 14),
  ('Cigarette', 15)
) AS v(name, ord)
ON CONFLICT (name) DO NOTHING;

-- ================================================ 6a2. MASTER FOOD GROUPS
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS food_group TEXT DEFAULT 'food';
UPDATE menu_categories SET food_group = 'beverage'
WHERE name IN ('Hot Beverages', 'Beverages', 'Beer', 'Domestic Hard Drinks')
  AND COALESCE(food_group, 'food') <> 'beverage';
UPDATE menu_categories SET food_group = 'food'
WHERE name NOT IN ('Hot Beverages', 'Beverages', 'Beer', 'Domestic Hard Drinks')
  AND (food_group IS NULL OR food_group = '' OR lower(food_group) IN ('foods', 'beverages'));

-- ================================================= 6b. MENU ITEMS (178)
-- "Option" items on the source menu (size/spice/half-full variants) are
-- seeded here at their single listed base price — the source list names the
-- flag but never the actual option names or price deltas, so no variant rows
-- are fabricated. Add real variants per item later via Admin -> Products, or
-- ask for a menu_item_variants patch once you have the option details.
-- No item has a photo yet (image_url left NULL) — upload via Admin -> Products.
INSERT INTO menu_items (name, category_id, base_price, is_available, display_order, image_url, tags)
SELECT v.name, c.id, v.price, 1, v.ord, NULL, v.tags
FROM (VALUES
  -- Hot Beverages
  ('Tea (Lemon/Black)','Hot Beverages',25,1,'popular'),
  ('Milk Tea','Hot Beverages',30,2,'popular'),
  ('Hot Lemon With Honey','Hot Beverages',115,3,NULL),
  ('Black Coffee','Hot Beverages',109,4,NULL),
  ('Milk Coffee','Hot Beverages',140,5,NULL),
  ('Americano','Hot Beverages',109,6,NULL),
  ('Dopio','Hot Beverages',130,7,NULL),
  ('Matka Tea','Hot Beverages',60,8,NULL),
  ('Expresso','Hot Beverages',129,9,NULL),
  -- Rice & Noodles
  ('Mushroom Fried Rice','Rice & Noodles',150,1,'popular'),
  ('Egg Fried Rice','Rice & Noodles',130,2,'popular'),
  ('Chicken Fried Rice','Rice & Noodles',150,3,NULL),
  ('Mutton Fried Rice','Rice & Noodles',180,4,NULL),
  ('Mix Fried Rice','Rice & Noodles',225,5,NULL),
  ('Veg. Biryani','Rice & Noodles',190,6,NULL),
  ('Chicken Biryani','Rice & Noodles',325,7,NULL),
  ('Veg. Chowmein','Rice & Noodles',60,8,NULL),
  ('Chicken Chowmein','Rice & Noodles',130,9,NULL),
  ('Mutton Chowmein','Rice & Noodles',169,10,NULL),
  ('Mix Chowmein','Rice & Noodles',195,11,NULL),
  ('Veg Fried Rice (Small)','Rice & Noodles',110,12,NULL),
  ('Egg Rice Chaumin Mix','Rice & Noodles',150,13,NULL),
  ('Rice Chaumin Mix Veg','Rice & Noodles',80,14,NULL),
  ('Rice Chaumin Mix Chicken','Rice & Noodles',130,15,NULL),
  ('Rice Chaumin Mix Mutton','Rice & Noodles',160,16,NULL),
  ('Egg Chaumin','Rice & Noodles',80,17,NULL),
  ('Mushroom Chaumin','Rice & Noodles',150,18,NULL),
  ('Jera Rice','Rice & Noodles',145,19,NULL),
  ('Mutton Biryani','Rice & Noodles',450,20,NULL),
  -- Momo Specials
  ('Chicken MoMo (Steam)','Momo Specials',90,1,'popular'),
  ('Chicken MoMo (Fry)','Momo Specials',190,2,'popular'),
  ('Mutton MoMo (Steam)','Momo Specials',95,3,NULL),
  ('Mutton MoMo (Fry)','Momo Specials',200,4,NULL),
  ('KTM Jhol MoMo (Chicken)','Momo Specials',180,5,NULL),
  ('KTM Jhol MoMo (Mutton)','Momo Specials',220,6,NULL),
  ('Wow MoMo (Chicken)','Momo Specials',230,7,NULL),
  ('Wow MoMo (Mutton)','Momo Specials',250,8,NULL),
  ('Chilly MoMo (Chicken)','Momo Specials',230,9,NULL),
  ('Chilly MoMo (Mutton)','Momo Specials',250,10,NULL),
  ('Veg. Paneer MoMo (Steam)','Momo Specials',160,11,NULL),
  ('Veg. Paneer MoMo (Fry)','Momo Specials',175,12,NULL),
  ('Veg. Paneer MoMo (Jhol)','Momo Specials',170,13,NULL),
  ('Veg. Paneer MoMo (Chilly)','Momo Specials',200,14,NULL),
  ('Mutton Kotha MoMo','Momo Specials',255,15,NULL),
  ('Chicken Kotha MoMo','Momo Specials',235,16,NULL),
  ('Chicken MoMo (Office, Steam)','Momo Specials',190,17,NULL),
  ('Mutton MoMo (Office, Steam)','Momo Specials',200,18,NULL),
  ('C Momo','Momo Specials',80,19,NULL),
  ('Sizzler Momo','Momo Specials',290,20,NULL),
  -- Vegetarian Choices
  ('Mushroom Pakoda','Vegetarian Choices',280,1,'popular'),
  ('Mushroom Chilly','Vegetarian Choices',290,2,'popular'),
  ('Corn Salt Pepper','Vegetarian Choices',290,3,NULL),
  ('Paneer Pakoda','Vegetarian Choices',290,4,NULL),
  ('Paneer Chilly','Vegetarian Choices',290,5,NULL),
  ('Veg. Pakoda','Vegetarian Choices',180,6,NULL),
  ('Waiwai Chatpate','Vegetarian Choices',130,7,NULL),
  ('Peanuts Sandeko','Vegetarian Choices',160,8,NULL),
  ('Bhatmas Sandeko','Vegetarian Choices',130,9,NULL),
  ('Fruit Salad','Vegetarian Choices',130,10,NULL),
  ('Green Salad','Vegetarian Choices',160,11,NULL),
  ('Kaju Fry','Vegetarian Choices',325,12,NULL),
  ('Papad Fry','Vegetarian Choices',90,13,NULL),
  ('Popcorn','Vegetarian Choices',115,14,NULL),
  ('Mix Salad','Vegetarian Choices',250,15,NULL),
  ('Prawn Fry','Vegetarian Choices',135,16,NULL),
  ('Khir Set','Vegetarian Choices',300,17,NULL),
  -- Soup
  ('Mushroom Soup','Soup',195,1,'popular'),
  ('Chicken Soup','Soup',225,2,'popular'),
  ('Veg. Thukpa','Soup',195,3,NULL),
  ('Chicken Thukpa','Soup',195,4,NULL),
  ('Mutton Bone Soup','Soup',170,5,NULL),
  ('Chicken Manchow Soup','Soup',195,6,NULL),
  -- Breakfast Menu
  ('Bread Omelet','Breakfast Menu',149,1,'popular'),
  ('Masala Omelet (2 Eggs)','Breakfast Menu',120,2,'popular'),
  ('Masala Omelet with Toast','Breakfast Menu',150,3,NULL),
  ('Boil Egg','Breakfast Menu',50,4,NULL),
  ('Bread','Breakfast Menu',10,5,NULL),
  ('Egg Pose','Breakfast Menu',100,6,NULL),
  -- Mutton Starters
  ('Mutton Sekuwa','Mutton Starters',350,1,'popular'),
  ('Mutton Chhoila','Mutton Starters',350,2,'popular'),
  ('Bhutuwa (Set)','Mutton Starters',230,3,NULL),
  ('Kaan Gidi Jibro (Set)','Mutton Starters',250,4,NULL),
  ('Mutton Sekuwa Jhaneko','Mutton Starters',395,5,NULL),
  ('Mutton Sukuti Sandeko','Mutton Starters',350,6,NULL),
  -- Chicken Starters
  ('Chicken Sandeko','Chicken Starters',290,1,'popular'),
  ('Chicken Sekuwa','Chicken Starters',290,2,'popular'),
  ('Chicken Chhoila','Chicken Starters',290,3,NULL),
  ('Chicken Sausage Fry (4 Pcs)','Chicken Starters',60,4,NULL),
  ('Chicken Chilly','Chicken Starters',325,5,NULL),
  ('Chicken Lollipop (5 Pcs)','Chicken Starters',325,6,NULL),
  ('KFC Chicken Drumstick (3 Pcs)','Chicken Starters',450,7,NULL),
  ('Sausage','Chicken Starters',160,8,NULL),
  ('Chicken Boil','Chicken Starters',295,9,NULL),
  ('Chicken Lollipop (Piece)','Chicken Starters',65,10,NULL),
  ('Chicken Spider','Chicken Starters',350,11,NULL),
  ('Chicken Nugget','Chicken Starters',350,12,NULL),
  ('Cornduck','Chicken Starters',150,13,NULL),
  ('Chicken Tass','Chicken Starters',350,14,NULL),
  -- Fast Food Menu
  ('Chicken Pizza (Medium)','Fast Food Menu',600,1,'popular'),
  ('Mix Pizza (Medium)','Fast Food Menu',650,2,'popular'),
  ('Veg. Pizza (Medium)','Fast Food Menu',525,3,NULL),
  ('Chicken Burger','Fast Food Menu',180,4,NULL),
  ('Veg. Burger','Fast Food Menu',140,5,NULL),
  ('Chicken Sandwich','Fast Food Menu',150,6,NULL),
  ('Veg. Sandwich','Fast Food Menu',130,7,NULL),
  ('French Fries','Fast Food Menu',170,8,NULL),
  ('Chilly Potato','Fast Food Menu',195,9,NULL),
  ('Add Soup','Fast Food Menu',50,10,NULL),
  ('Lasoon Fry','Fast Food Menu',110,11,NULL),
  ('Dry Kaju','Fast Food Menu',300,12,NULL),
  ('Honey','Fast Food Menu',50,13,NULL),
  ('Roti','Fast Food Menu',35,14,NULL),
  -- KTM Special Food
  ('Chicken Curry','KTM Special Food',300,1,NULL),
  ('Chicken Chatamari','KTM Special Food',350,2,'popular'),
  ('Chicken Leg Piece (1 Piece)','KTM Special Food',350,3,'popular'),
  ('Chicken Drumstick (3 Piece)','KTM Special Food',450,4,NULL),
  ('Chicken Wings (3 Piece)','KTM Special Food',450,5,NULL),
  ('KTM Roll','KTM Special Food',270,6,NULL),
  ('Aloo Sandeko','KTM Special Food',270,7,NULL),
  ('KTM Chicken Sizzler','KTM Special Food',450,8,NULL),
  ('KTM Dragon Chicken','KTM Special Food',450,9,NULL),
  ('KTM Crispy Chicken','KTM Special Food',350,10,NULL),
  ('Chicken Roast','KTM Special Food',295,11,NULL),
  ('Sekuwa Chicken Gaule (Gravy)','KTM Special Food',295,12,NULL),
  ('KTM Sausage Chilly','KTM Special Food',280,13,NULL),
  ('Veg. Khaja Set','KTM Special Food',250,14,NULL),
  ('Nanglo Set','KTM Special Food',999,15,NULL),
  ('Non-Veg Khaja Set','KTM Special Food',300,16,NULL),
  ('Chef Special Premium','KTM Special Food',450,17,NULL),
  ('Chef Special Deluxe','KTM Special Food',350,18,NULL),
  -- Nepali Thali
  ('Veg. Thali','Nepali Thali',275,1,'popular'),
  ('Chicken Thali','Nepali Thali',450,2,'popular'),
  ('Mutton Thali','Nepali Thali',495,3,NULL),
  ('Dal Curry','Nepali Thali',149,4,NULL),
  -- Beverages
  ('Masala Coke','Beverages',90,1,'popular'),
  ('Mix Fruit Juice (Glass)','Beverages',125,2,'popular'),
  ('Mineral Water','Beverages',30,3,NULL),
  ('Sweet Lassi','Beverages',120,4,NULL),
  ('Fruit Lassi','Beverages',150,5,NULL),
  ('Badam Drink','Beverages',150,6,NULL),
  ('Coke','Beverages',80,7,NULL),
  ('Red Bull Yellow','Beverages',150,8,NULL),
  ('Milk','Beverages',50,9,NULL),
  ('Xtreme','Beverages',230,10,NULL),
  ('Fruity','Beverages',40,11,NULL),
  ('Dew','Beverages',80,12,NULL),
  ('Fanta','Beverages',80,13,NULL),
  ('Pepsi','Beverages',80,14,NULL),
  ('Plain Lassi','Beverages',80,15,NULL),
  ('Cold Drink (Jumbo)','Beverages',400,16,NULL),
  ('Red Bull Blue','Beverages',300,17,NULL),
  ('Sprite','Beverages',80,18,NULL),
  -- Beer
  ('Tuborg Gold','Beer',575,1,'popular'),
  ('Tuborg Strong','Beer',550,2,'popular'),
  ('Arna Beer (Small)','Beer',250,3,NULL),
  ('Apple Cider','Beer',250,4,NULL),
  ('Hukka','Beer',350,5,NULL),
  ('Carlsberg Beer','Beer',625,6,NULL),
  ('Nepal Ice','Beer',500,7,NULL),
  ('Barahsinghe Pilsener Beer','Beer',625,8,NULL),
  ('Nepal Ice (Can)','Beer',350,9,NULL),
  ('Two Share Win (Combo)','Beer',2300,10,NULL),
  -- Domestic Hard Drinks
  ('Yati Vodka','Domestic Hard Drinks',750,1,NULL),
  ('Seto Bagh','Domestic Hard Drinks',750,2,NULL),
  ('Bigmaster','Domestic Hard Drinks',1600,3,NULL),
  ('Old Durbar Red','Domestic Hard Drinks',150,4,'popular'),
  ('Old Durbar Black','Domestic Hard Drinks',185,5,'popular'),
  ('Signature Red','Domestic Hard Drinks',150,6,NULL),
  ('Signature Green','Domestic Hard Drinks',150,7,NULL),
  ('8848 Vodka','Domestic Hard Drinks',125,8,NULL),
  ('Golden Oak','Domestic Hard Drinks',75,9,NULL),
  ('Blue Diamond','Domestic Hard Drinks',80,10,NULL),
  ('Khukuri Rum (Red)','Domestic Hard Drinks',125,11,NULL),
  ('Nude Vodka','Domestic Hard Drinks',125,12,NULL),
  ('Highlander','Domestic Hard Drinks',400,13,NULL),
  -- Cigarette
  ('Surya','Cigarette',30,1,'popular'),
  ('Shikhar Ice','Cigarette',25,2,'popular'),
  ('Coil','Cigarette',50,3,NULL)
) AS v(name, cat, price, ord, tags)
JOIN menu_categories c ON c.name = v.cat
WHERE NOT EXISTS (
  SELECT 1 FROM menu_items m WHERE m.name = v.name AND m.category_id = c.id
);
-- ================================================ 7. INVENTORY CATEGORIES
INSERT INTO inventory_categories (name, normalized_name)
SELECT v.name, lower(v.name) FROM (VALUES
  ('Grains & Flour'),
  ('Bakery'),
  ('Meat & Poultry'),
  ('Vegetables'),
  ('Fruits'),
  ('Dairy'),
  ('Oil & Fats'),
  ('Spices & Condiments'),
  ('Beverages')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM inventory_categories c WHERE lower(c.name) = lower(v.name));

-- ===================================== 7b. INGREDIENT MASTER (opening stock 0)
-- quantity = 0 on purpose: the client enters real stock later. cost/min are 0
-- too; only the recipe lines below carry per-dish amounts.
INSERT INTO inventory_items
  (item_name, name, quantity, unit, cost_per_unit, min_stock_level, min_stock, category, supplier, notes, created_at, updated_at)
SELECT v.item_name, v.item_name, 0, v.unit, 0, 0, 0, v.category,
       'To be set', 'DSP seed ingredient', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  -- Grains & Flour
  ('Rice','kg','Grains & Flour'),
  ('Basmati Rice','kg','Grains & Flour'),
  ('Maida (Flour)','kg','Grains & Flour'),
  ('Chowmein Noodles','kg','Grains & Flour'),
  ('Corn Kernels','kg','Grains & Flour'),
  -- Bakery
  ('Bread','pcs','Bakery'),
  ('Burger Bun','pcs','Bakery'),
  ('Pizza Base','pcs','Bakery'),
  ('Oreo Biscuit','pcs','Bakery'),
  -- Meat & Poultry
  ('Chicken','kg','Meat & Poultry'),
  ('Mutton','kg','Meat & Poultry'),
  ('Chicken Liver','kg','Meat & Poultry'),
  ('Chicken Sausage','pcs','Meat & Poultry'),
  ('Eggs','pcs','Meat & Poultry'),
  -- Vegetables
  ('Potato','kg','Vegetables'),
  ('Onion','kg','Vegetables'),
  ('Tomato','kg','Vegetables'),
  ('Mushroom','kg','Vegetables'),
  ('Mixed Vegetables','kg','Vegetables'),
  ('Peanuts','kg','Vegetables'),
  ('Cashew Nut','kg','Vegetables'),
  ('Mint Leaves','kg','Vegetables'),
  ('Lemon','pcs','Vegetables'),
  -- Fruits
  ('Watermelon','kg','Fruits'),
  ('Apple','kg','Fruits'),
  ('Orange','kg','Fruits'),
  ('Banana','pcs','Fruits'),
  ('Mixed Fruits','kg','Fruits'),
  -- Dairy
  ('Paneer','kg','Dairy'),
  ('Milk','l','Dairy'),
  ('Cheese','kg','Dairy'),
  ('Cream','l','Dairy'),
  ('Curd','kg','Dairy'),
  ('Ice Cream','l','Dairy'),
  -- Oil & Fats
  ('Cooking Oil','l','Oil & Fats'),
  ('Mustard Oil','l','Oil & Fats'),
  ('Ghee','kg','Oil & Fats'),
  -- Spices & Condiments
  ('Salt','kg','Spices & Condiments'),
  ('Sugar','kg','Spices & Condiments'),
  ('Mixed Spices (Masala)','kg','Spices & Condiments'),
  ('Biryani Masala','kg','Spices & Condiments'),
  ('Timur','kg','Spices & Condiments'),
  ('Black Pepper','kg','Spices & Condiments'),
  ('Soy Sauce','l','Spices & Condiments'),
  ('Chilli Sauce','l','Spices & Condiments'),
  ('Honey','kg','Spices & Condiments'),
  -- Beverages
  ('Coffee Powder','kg','Beverages'),
  ('Instant Coffee (Nescafe)','kg','Beverages'),
  ('Tea Leaves','kg','Beverages'),
  ('Green Tea Bag','pcs','Beverages'),
  ('Herbal Tea Bag','pcs','Beverages'),
  ('Cola Syrup','l','Beverages'),
  ('Chocolate Syrup','l','Beverages'),
  ('Real Juice Pack','pcs','Beverages'),
  ('Cold Drink Bottle','pcs','Beverages'),
  ('Red Bull Can','pcs','Beverages')
) AS v(item_name, unit, category)
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_items i WHERE i.item_name = v.item_name AND i.notes = 'DSP seed ingredient'
);

-- Backfill category_id from the category text.
UPDATE inventory_items i
SET category_id = c.id
FROM inventory_categories c
WHERE lower(c.name) = lower(i.category)
  AND i.category_id IS NULL
  AND i.notes = 'DSP seed ingredient';

-- ================================================= 8. RECIPES (one per item)
INSERT INTO recipes (name, type, menu_item_id, yield_quantity, yield_unit, prep_notes)
SELECT m.name, 'menu_item', m.id, 1, 'plate', '__dsp_seed__'
FROM menu_items m
WHERE NOT EXISTS (
  SELECT 1 FROM recipes r WHERE r.menu_item_id = m.id AND r.prep_notes = '__dsp_seed__'
);
-- ============================================ 9. MIGRATION MARKERS (001..038)
INSERT INTO schema_migrations (version) VALUES
  ('001_init'),('002_tables_extra_columns'),('003_expenses_notes_stock'),('004_recipe_bom'),
  ('005_leads_viewed_at'),('006_inventory_expense_upgrade'),('007_inventory_category'),('008_inventory_ledger'),
  ('009_wastage_reason_vocabulary'),('010_list_query_indexes'),('011_unit_conversions'),('012_inventory_categories'),
  ('013_table_floors_types'),('014_payroll'),('015_accounting'),('016_expense_categories'),
  ('017_accounting_hardening'),('018_accounting_numeric'),('019_supplier_ledger'),('020_bank_reconciliation'),
  ('021_table_qr_token'),('022_kitchen_timing'),('023_bill_corrections'),('024_online_orders'),
  ('025_bill_admin'),('026_split_billing'),('027_vat_payable_account'),('028_admin_pos_kot'),
  ('029_order_party'),('030_pos_lifecycle_audit_numbers'),('031_analytics_overview_indexes'),('032_business_days'),
  ('033_business_day_sessions'),('034_opening_cash_movement_accounts'),('035_inventory_business_day_attribution'),
  ('036_savings_deposits'),('037_business_day_stale_ack'),('038_role_permissions')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Sanity checks (run separately if you like):
--   SELECT COUNT(*) FROM menu_categories;   -- 15
--   SELECT COUNT(*) FROM menu_items;        -- 178
--   SELECT COUNT(*) FROM recipes;           -- 178 (empty shells)
--   SELECT COUNT(*) FROM inventory_items;   -- 57 (all quantity 0)
--   SELECT COUNT(*) FROM tables;            -- 12
--   SELECT COUNT(*) FROM business_days;     -- 0 (open one from Admin -> Opening & Closing)
