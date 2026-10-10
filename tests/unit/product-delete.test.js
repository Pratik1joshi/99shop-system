import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PosDatabase } from '../../lib/db/index.js';
import { ensureRetailCommerceSchema } from '../../lib/retail-commerce-schema.js';
import { ensureRetailInventorySchema } from '../../lib/retail-inventory.js';
import { deleteProduct, removeVariant, setVariantAttributes } from '../../lib/product-catalog.js';

// One database for the file: the schema helpers remember they already ran.
const file = path.join(os.tmpdir(), `product-delete-${process.pid}-${Date.now()}.db`);
let shared;
async function withDb(fn) {
  if (!shared) {
    shared = new PosDatabase(file);
    await ensureRetailCommerceSchema(shared);
    await ensureRetailInventorySchema(shared);
    // Any table with a variant_id column counts as history, FK or not.
    await shared.run('CREATE TABLE IF NOT EXISTS test_sale_history (id INTEGER PRIMARY KEY, variant_id INTEGER)');
  }
  await fn(shared);
}
test.after(async () => {
  await shared?.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
});

async function product(db, names) {
  const category = (await db.run('INSERT INTO product_categories(name) VALUES (?)', [`Delete test ${Math.random()}`])).lastInsertRowid;
  const id = (await db.run('INSERT INTO products(name,base_price,category_id,is_available) VALUES (?,10,?,1)', [`P${Date.now()}${Math.random()}`, category])).lastInsertRowid;
  const variants = [];
  for (const name of names) variants.push((await db.run('INSERT INTO product_variants(product_id,variant_name,price,price_modifier,is_default) VALUES (?,?,10,0,0)', [id, name])).lastInsertRowid);
  await setVariantAttributes(db, variants[0], { Size: 'S' });
  await db.run('INSERT INTO product_barcodes(product_id,variant_id,barcode) VALUES (NULL,?,?)', [variants[0], `T${id}`]);
  return { id, variants };
}

test('unused version and product are deleted with their settings', async () => {
  await withDb(async (db) => {
    const { id, variants } = await product(db, ['S', 'M']);
    assert.equal(await db.transaction((tx) => removeVariant(tx, variants[0])), 'deleted');
    assert.equal(await db.get('SELECT id FROM product_variants WHERE id=?', [variants[0]]), undefined);
    assert.equal(await db.get('SELECT id FROM product_barcodes WHERE variant_id=?', [variants[0]]), undefined);
    assert.equal(await db.get('SELECT id FROM variant_attribute_values WHERE variant_id=?', [variants[0]]), undefined);
    assert.equal(await db.transaction((tx) => deleteProduct(tx, id)), 'deleted');
    assert.equal(await db.get('SELECT id FROM products WHERE id=?', [id]), undefined);
  });
});

test('version or product with history is hidden, never deleted', async () => {
  await withDb(async (db) => {
    const { id, variants } = await product(db, ['S', 'M']);
    await db.run('INSERT INTO test_sale_history(variant_id) VALUES (?)', [variants[1]]);
    assert.equal(await db.transaction((tx) => removeVariant(tx, variants[1])), 'archived');
    assert.equal(Number((await db.get('SELECT merchandising_active FROM product_variants WHERE id=?', [variants[1]])).merchandising_active), 0);
    assert.equal(await db.transaction((tx) => deleteProduct(tx, id)), 'archived');
    const row = await db.get('SELECT is_available, online_enabled FROM products WHERE id=?', [id]);
    assert.deepEqual([Number(row.is_available), Number(row.online_enabled)], [0, 0]);
    assert.ok(await db.get('SELECT id FROM product_variants WHERE id=?', [variants[0]]), 'variants stay for reports');
  });
});

test('version still holding stock cannot be removed', async () => {
  await withDb(async (db) => {
    const { variants } = await product(db, ['S', 'M']);
    const location = (await db.run("INSERT INTO inventory_locations(name,code) VALUES ('Test shelf', ?)", [`T${Date.now()}`])).lastInsertRowid;
    await db.run('INSERT INTO inventory_balances(variant_id,location_id,quantity_on_hand) VALUES (?,?,5)', [variants[0], location]);
    await assert.rejects(db.transaction((tx) => removeVariant(tx, variants[0])), /still has 5 in stock/);
    assert.ok(await db.get('SELECT id FROM product_variants WHERE id=? AND merchandising_active=1', [variants[0]]));
  });
});
