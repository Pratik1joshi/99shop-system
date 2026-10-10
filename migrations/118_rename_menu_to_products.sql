-- Product tables are named for what they hold: products, their variants and
-- categories. PostgreSQL carries foreign keys and views across a rename.

ALTER TABLE IF EXISTS menu_categories RENAME TO product_categories;
ALTER TABLE IF EXISTS menu_items RENAME TO products;
ALTER TABLE IF EXISTS menu_item_variants RENAME TO product_variants;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'product_variants' AND column_name = 'menu_item_id') THEN
    ALTER TABLE product_variants RENAME COLUMN menu_item_id TO product_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'product_barcodes' AND column_name = 'menu_item_id') THEN
    ALTER TABLE product_barcodes RENAME COLUMN menu_item_id TO product_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'product_categories' AND column_name = 'food_group') THEN
    ALTER TABLE product_categories RENAME COLUMN food_group TO category_group;
  END IF;
END $$;

-- Indexes, sequences and constraints keep their generated names after a
-- rename; bring those in line too.
DO $$
DECLARE
  rel RECORD;
  con RECORD;
  next_name TEXT;
BEGIN
  FOR rel IN
    SELECT c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND c.relkind IN ('i', 'S')
       AND c.relname ~ '(menu_item_variants|menu_items|menu_categories|menu_item_id)'
  LOOP
    next_name := replace(replace(replace(replace(rel.relname,
      'menu_item_variants', 'product_variants'), 'menu_items', 'products'),
      'menu_categories', 'product_categories'), 'menu_item_id', 'product_id');
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = current_schema() AND c.relname = next_name) THEN
      IF rel.relkind = 'i' THEN
        EXECUTE format('ALTER INDEX %I RENAME TO %I', rel.relname, next_name);
      ELSE
        EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', rel.relname, next_name);
      END IF;
    END IF;
  END LOOP;

  FOR con IN
    SELECT t.relname AS table_name, k.conname
      FROM pg_constraint k
      JOIN pg_class t ON t.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = current_schema() AND k.contype IN ('f', 'c', 'u', 'p')
       AND k.conname ~ '(menu_item_variants|menu_items|menu_categories|menu_item_id)'
       AND NOT EXISTS (SELECT 1 FROM pg_class i WHERE i.oid = k.conindid AND i.relname = k.conname)
  LOOP
    next_name := replace(replace(replace(replace(con.conname,
      'menu_item_variants', 'product_variants'), 'menu_items', 'products'),
      'menu_categories', 'product_categories'), 'menu_item_id', 'product_id');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = next_name) THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', con.table_name, con.conname, next_name);
    END IF;
  END LOOP;
END $$;

-- Catalog permissions and the product report follow the same naming. Saved
-- per-role choices move to the new keys; the audit trail keeps its history.
UPDATE role_permissions SET permission_key = 'catalog.view' WHERE permission_key = 'menu.view'
  AND NOT EXISTS (SELECT 1 FROM role_permissions r WHERE r.role = role_permissions.role AND r.permission_key = 'catalog.view');
UPDATE role_permissions SET permission_key = 'catalog.manage' WHERE permission_key = 'menu.manage'
  AND NOT EXISTS (SELECT 1 FROM role_permissions r WHERE r.role = role_permissions.role AND r.permission_key = 'catalog.manage');
UPDATE role_permissions SET permission_key = 'report.products.view' WHERE permission_key = 'report.menu.view'
  AND NOT EXISTS (SELECT 1 FROM role_permissions r WHERE r.role = role_permissions.role AND r.permission_key = 'report.products.view');
DELETE FROM role_permissions WHERE permission_key IN ('menu.view', 'menu.manage', 'report.menu.view');
