import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensureMenuVariantsSchema, ensureStandardVariant, findBarcodeConflict } from '@/lib/menu-variants.js';
import { ensureProductCatalogSchema, setVariantAttributes, getVariantAttributes, removeVariant, deleteProduct } from '@/lib/product-catalog.js';
import { attributeSignature } from '@/lib/retail-catalog-matrix.js';
import { lockCatalogWrite } from '@/lib/retail-catalog-lock.js';
import { internalCatalogBarcode } from '@/lib/retail-merchandising.js';
import { getDefaultLocation, getSellableStockBulk } from '@/lib/retail-inventory.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'menu.view' });
    if (auth.error) return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const db = Database.getInstance();
    await ensureProductCatalogSchema(db);
    const id = Number(new URL(request.url).searchParams.get('id'));
    const product = await db.get('SELECT p.id,p.name,p.base_price,p.barcode,p.brand,p.description,p.image_url,p.category_id,p.is_available,p.online_enabled,p.unit,c.name AS category_name FROM menu_items p LEFT JOIN menu_categories c ON c.id=p.category_id WHERE p.id=?', [id]);
    if (!product) throw bad('Product not found.', 404);
    // Removed SKUs stay in the table for history; the editor only shows live ones.
    const allVariants = await db.all('SELECT id,variant_name,price,sku,barcode,mrp,wholesale_price,tax_category,tracking_mode,reorder_point,reorder_quantity,is_default,merchandising_active FROM menu_item_variants WHERE menu_item_id=? ORDER BY is_default DESC,id LIMIT 400', [id]);
    const live = allVariants.filter((variant) => Number(variant.merchandising_active ?? 1) === 1);
    product.variants = (live.length ? live : allVariants).slice(0, 200);
    const attributes = await db.all(`SELECT vav.variant_id, a.name AS attribute, av.value
      FROM variant_attribute_values vav
      JOIN product_attributes a ON a.id=vav.attribute_id
      JOIN product_attribute_values av ON av.id=vav.attribute_value_id
      WHERE vav.variant_id IN (SELECT id FROM menu_item_variants WHERE menu_item_id=?)`, [id]);
    const byVariant = new Map();
    for (const row of attributes) byVariant.set(row.variant_id, { ...byVariant.get(row.variant_id), [row.attribute]: row.value });
    for (const variant of product.variants) variant.attributes = byVariant.get(variant.id) || {};
    const location = await getDefaultLocation(db);
    const stock = await getSellableStockBulk(db, product.variants.map((variant) => variant.id), { locationId: location.id });
    product.variants = product.variants.map((variant) => ({ ...variant, available_stock: stock[variant.id] || 0 }));
    product.barcodes = await db.all('SELECT id,variant_id,barcode,barcode_type,is_primary FROM product_barcodes WHERE menu_item_id=? OR variant_id IN (SELECT id FROM menu_item_variants WHERE menu_item_id=?) ORDER BY id LIMIT 200', [id, id]);
    return NextResponse.json({ product });
  } catch (error) { return handleRouteError(error, 'Could not load product.'); }
}
export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'menu.manage' });
    if (auth.error) return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const data = await request.json();
    const name = String(data.name || '').trim();
    const price = Number(data.price);
    if (!name || !Number.isFinite(price) || price < 0) throw bad('Name and a valid non-negative selling price are required.');
    const db = Database.getInstance();
    await ensureMenuVariantsSchema(db);
    await ensureProductCatalogSchema(db);
    const id = await db.transaction(async (tx) => {
      await lockCatalogWrite(tx);
      // No barcode typed = the shop's own number code, so stickers can be printed at once.
      const barcode = String(data.barcode || '').trim() || internalCatalogBarcode();
      if (await findBarcodeConflict(tx, [barcode])) throw bad('Barcode already belongs to a product.', 409);
      let categoryId = data.category_id;
      if (categoryId) {
        const selected = await tx.get('SELECT id FROM menu_categories WHERE id=?', [Number(categoryId)]);
        if (!selected) throw bad('Choose an existing category.');
        categoryId = selected.id;
      }
      if (!categoryId) {
        const category = await tx.get("SELECT id FROM menu_categories WHERE name='Uncategorized' ORDER BY id LIMIT 1");
        categoryId = category?.id || (await tx.run("INSERT INTO menu_categories(name,online_enabled) VALUES ('Uncategorized',1)")).lastInsertRowid;
      }
      const mrp = data.mrp === '' || data.mrp == null ? null : Number(data.mrp);
      if (mrp != null && (!Number.isFinite(mrp) || mrp < 0)) throw bad('MRP must be a non-negative number.');
      const result = await tx.run('INSERT INTO menu_items(name,base_price,barcode,is_available,online_enabled,category_id,brand,image_url,description) VALUES (?,?,?,1,1,?,?,?,?)', [name, price, barcode, categoryId, String(data.brand || '').trim() || null, String(data.image_url || '').trim() || null, String(data.description || '').trim() || null]);
      await ensureStandardVariant(tx, result.lastInsertRowid, { price });
      await tx.run('UPDATE menu_item_variants SET barcode=?,mrp=? WHERE menu_item_id=?', [barcode, mrp, result.lastInsertRowid]);
      return result.lastInsertRowid;
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return handleRouteError(error, 'Could not create product.'); }
}
export async function PUT(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'menu.manage' });
    if (auth.error) return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const data = await request.json();
    if (!String(data.name || '').trim()) throw bad('Product name is required.');
    const db = Database.getInstance();
    await ensureProductCatalogSchema(db);
    const removed = { deleted: 0, archived: 0 };
    await db.transaction(async (tx) => {
      await lockCatalogWrite(tx);
      const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
      const product = await tx.get(`SELECT id,is_combo FROM menu_items WHERE id=?${lock}`, [data.id]);
      if (!product) throw bad('Product not found.', 404);
      if (product.is_combo) throw bad('Manage this product through Combo Packs.', 409);
      let categoryId = data.category_id;
      if (categoryId) {
        const selected = await tx.get('SELECT id FROM menu_categories WHERE id=?', [Number(categoryId)]);
        if (!selected) throw bad('Choose an existing category.');
        categoryId = selected.id;
      } else {
        const fallback = await tx.get("SELECT id FROM menu_categories WHERE name='Uncategorized' ORDER BY id LIMIT 1");
        categoryId = fallback?.id || (await tx.run("INSERT INTO menu_categories(name,online_enabled) VALUES ('Uncategorized',1)")).lastInsertRowid;
      }
      const variants = await tx.all('SELECT id,sku,tracking_mode,barcode FROM menu_item_variants WHERE menu_item_id=?', [data.id]);
      if (!Array.isArray(data.variants) || !data.variants.length || data.variants.length > 200) throw bad('Save between 1 and 200 SKUs at a time.');
      const removeIds = [...new Set((Array.isArray(data.remove_variant_ids) ? data.remove_variant_ids : []).map(Number))];
      if (removeIds.some((rid) => !variants.some((row) => Number(row.id) === rid) || data.variants.some((v) => Number(v.id) === rid))) throw bad('A removed version does not belong to this product.');
      const typed = data.variants.map((v) => String(v.barcode || '').trim()).filter(Boolean);
      if (new Set(typed).size !== typed.length) throw bad('Two variants have the same barcode.', 409);
      for (const variant of data.variants || []) {
        const sku = String(variant.sku || '').trim() || null;
        if (sku && await tx.get('SELECT id FROM menu_item_variants WHERE sku=? AND id<>?', [sku, Number(variant.id) || -1])) throw bad(`SKU ${sku} is already in use.`, 409);
        for (const key of ['price', 'mrp', 'wholesale_price', 'reorder_point', 'reorder_quantity']) if (variant[key] != null && variant[key] !== '' && (!Number.isFinite(Number(variant[key])) || Number(variant[key]) < 0)) throw bad('Prices and reorder values must be non-negative.');
        if (!variant.id) {
          if (!variant.variant_name?.trim() || !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0) throw bad('New SKU needs a name and valid price.');
          if (!['none','batch','serial'].includes(variant.tracking_mode)) throw bad('Choose a supported tracking mode.');
          const newBarcode = String(variant.barcode || '').trim() || internalCatalogBarcode();
          if (await findBarcodeConflict(tx, [newBarcode], data.id)) throw bad(`Barcode ${newBarcode} already belongs to another product.`, 409);
          const created = await tx.run('INSERT INTO menu_item_variants(menu_item_id,variant_name,price,price_modifier,is_default,sku,barcode,tracking_mode,mrp,wholesale_price,tax_category,reorder_point,reorder_quantity) VALUES (?,?,?,0,0,?,?,?,?,?,?,?,?)', [data.id,variant.variant_name.trim(),Number(variant.price),sku,newBarcode,variant.tracking_mode,variant.mrp || null,variant.wholesale_price || null,variant.tax_category || null,variant.reorder_point || 0,variant.reorder_quantity || 0]);
          if (variant.attributes) await setVariantAttributes(tx, created.lastInsertRowid, variant.attributes);
          continue;
        }
        const existing = variants.find((row) => Number(row.id) === Number(variant.id));
        if (!existing) throw bad('SKU does not belong to this product.');
        const priorAttributes=Object.fromEntries((await getVariantAttributes(tx,variant.id)).map(row=>[row.attribute,row.value]));
        if(existing.sku!==sku||(variant.attributes&&attributeSignature(priorAttributes)!==attributeSignature(variant.attributes))){
          const used=await tx.get('SELECT id FROM inventory_movements WHERE variant_id=? LIMIT 1',[variant.id])||await tx.get('SELECT id FROM retail_sale_lines WHERE variant_id=? LIMIT 1',[variant.id]);
          if(used)throw bad(`“${variant.variant_name || 'This version'}” has already been sold or stocked, so its size, colour and SKU can't change. Remove it and keep a new version instead.`,409);
        }
        if (!['none', 'batch', 'serial'].includes(variant.tracking_mode)) throw bad('Choose a supported tracking mode.');
        if (existing.tracking_mode !== variant.tracking_mode) {
          const used = await tx.get('SELECT id FROM inventory_movements WHERE variant_id=? LIMIT 1', [variant.id]);
          if (used) throw bad('Tracking cannot change after stock movements. Create a separate SKU for the new tracking policy.', 409);
          if (!data.confirm_tracking) throw bad('Confirm the tracking change before saving.');
        }
        await tx.run('UPDATE menu_item_variants SET variant_name=?,sku=?,price=?,mrp=?,wholesale_price=?,tax_category=?,reorder_point=?,reorder_quantity=?,tracking_mode=? WHERE id=? AND menu_item_id=?', [variant.variant_name || 'Standard', sku, Number(variant.price), variant.mrp || null, variant.wholesale_price || null, variant.tax_category || null, variant.reorder_point || 0, variant.reorder_quantity || 0, variant.tracking_mode, variant.id, data.id]);
        if (variant.attributes) await setVariantAttributes(tx, variant.id, variant.attributes);
        // A barcode can be added or replaced; a blank field keeps the current one.
        const barcode = String(variant.barcode ?? '').trim();
        if (barcode && barcode !== String(existing.barcode || '')) {
          if (await findBarcodeConflict(tx, [barcode], data.id)) throw bad(`Barcode ${barcode} already belongs to another product.`, 409);
          await tx.run('UPDATE menu_item_variants SET barcode=? WHERE id=? AND menu_item_id=?', [barcode, variant.id, data.id]);
          // Single-SKU products also carry the code on the product row; keep them equal.
          await tx.run('UPDATE menu_items SET barcode=? WHERE id=? AND (SELECT COUNT(*) FROM menu_item_variants WHERE menu_item_id=?)=1', [barcode, data.id, data.id]);
        }
      }
      for (const rid of removeIds) removed[await removeVariant(tx, rid)] += 1;
      if (!await tx.get('SELECT id FROM menu_item_variants WHERE menu_item_id=? AND merchandising_active=1 LIMIT 1', [data.id])) throw bad('Keep at least one version. To stop selling this product, use Delete product.');
      // The product row mirrors its first SKU's barcode; drop it once that SKU is removed or its
      // old INT- code was switched to a number. (Old products keep a code that lives only here.)
      await tx.run("UPDATE menu_items SET barcode=NULL WHERE id=? AND (?=1 OR barcode LIKE 'INT-%') AND NOT EXISTS(SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id=menu_items.id AND v.merchandising_active=1 AND v.barcode=menu_items.barcode)", [data.id, removeIds.length ? 1 : 0]);
      // The default SKU may have been removed; the oldest live one takes over.
      await tx.run('UPDATE menu_item_variants SET is_default=1 WHERE id=(SELECT id FROM menu_item_variants WHERE menu_item_id=? AND merchandising_active=1 ORDER BY id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM menu_item_variants WHERE menu_item_id=? AND merchandising_active=1 AND is_default=1)', [data.id, data.id]);
      await tx.run('UPDATE menu_items SET name=?,category_id=?,brand=?,description=?,image_url=?,is_available=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [data.name.trim(), categoryId, data.brand || null, data.description || null, data.image_url || null, data.is_available ? 1 : 0, data.id]);
      if (data.online_enabled !== undefined) await tx.run('UPDATE menu_items SET online_enabled=? WHERE id=?', [data.online_enabled ? 1 : 0, data.id]);
      await tx.run('UPDATE menu_items SET base_price=(SELECT price FROM menu_item_variants WHERE menu_item_id=? AND merchandising_active=1 ORDER BY is_default DESC,id LIMIT 1) WHERE id=?', [data.id, data.id]);
    });
    return NextResponse.json({ id: data.id, removed });
  } catch (error) { return handleRouteError(error, 'Could not save product.'); }
}
/** Deletes a never-used product; one with sales or stock history is taken off sale instead. */
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'menu.manage' });
    if (auth.error) return auth.error;
    const db = Database.getInstance();
    await ensureRetailCommerceSchema(db);
    const id = Number(new URL(request.url).searchParams.get('id'));
    const result = await db.transaction(async (tx) => {
      await lockCatalogWrite(tx);
      const product = await tx.get('SELECT id,is_combo FROM menu_items WHERE id=?', [id]);
      if (!product) throw bad('Product not found.', 404);
      if (Number(product.is_combo)) throw bad('Manage this product through Combo Packs.', 409);
      return deleteProduct(tx, id);
    });
    return NextResponse.json({ id, result });
  } catch (error) { return handleRouteError(error, 'Could not delete product.'); }
}
