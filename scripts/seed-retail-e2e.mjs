/** Minimal browser fixture. Inventory is received later through the real GRN API. */
import pg from 'pg';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//i.test(url)) throw new Error('DATABASE_URL must be PostgreSQL.');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const cashierPassword = process.env.E2E_CASHIER_PASSWORD;
  if (!cashierPassword || cashierPassword.length < 8) throw new Error('Set E2E_CASHIER_PASSWORD for the real cashier fixture.');
  await client.query("INSERT INTO users(username,password_hash,full_name,role,is_active,must_change_password) VALUES ('commerce_cashier',$1,'Commerce Cashier','cashier',1,0) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role='cashier',is_active=1,must_change_password=0", [bcrypt.hashSync(cashierPassword,12)]);

  for (const key of ['menu.manage','retail_sale.discount','retail_sale.price_override','retail_sale.view_cost','retail_sale.view_profit','retail_purchasing.view_cost','retail_inventory.view_cost']) await client.query("INSERT INTO role_permissions(role,permission_key,allowed) VALUES ('cashier',$1,0) ON CONFLICT(role,permission_key) DO UPDATE SET allowed=0", [key]);
  await client.query(`UPDATE users SET must_change_password=0 WHERE username='admin'`);
  const existing = await client.query(`SELECT id FROM menu_categories WHERE name='E2E Retail' LIMIT 1`);
  const categoryId = existing.rowCount
    ? existing.rows[0].id
    : (await client.query(`INSERT INTO menu_categories(name,display_order) VALUES ('E2E Retail',999) RETURNING id`)).rows[0].id;

  async function upsertProduct({ name, sku, barcode, price, tracking = 'none' }) {
    let product = await client.query(`SELECT id FROM menu_items WHERE sku=$1`, [sku]);
    if (!product.rowCount) {
      product = await client.query(
        `INSERT INTO menu_items(name,category_id,base_price,is_available,sku,barcode,unit)
         VALUES ($1,$2,$3,1,$4,$5,'pcs') RETURNING id`,
        [name, categoryId, price, sku, barcode]
      );
    }
    const productId = product.rows[0].id;
    await client.query(
      `INSERT INTO menu_item_variants
         (menu_item_id,variant_name,price_modifier,is_default,price,stock_unit,pos_stock_visible,barcode,sku,tracking_mode)
       SELECT $1,'Standard',0,1,$2,'pcs',0,$3,$4,$5
       WHERE NOT EXISTS (SELECT 1 FROM menu_item_variants WHERE menu_item_id=$1)`,
      [productId, price, barcode, sku, tracking]
    );
  }

  await upsertProduct({ name: 'E2E Everyday Item', sku: 'E2E-STANDARD', barcode: '990000000001', price: 100 });
  await upsertProduct({ name: 'E2E Serial Device', sku: 'E2E-SERIAL', barcode: '990000000002', price: 250, tracking: 'serial' });
  await client.query(`
    INSERT INTO suppliers(name,normalized_name,phone)
    SELECT 'E2E Supplier','e2e supplier','9800000099'
    WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE normalized_name='e2e supplier')
  `);
} finally {
  await client.end();
}

console.log('Retail browser fixture seeded (catalog only; no inventory rows injected).');
