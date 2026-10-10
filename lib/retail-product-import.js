import { parseCatalogCsv, PRODUCT_CSV_COLUMNS } from './retail-catalog-matrix.js';
import { ensureProductVariantsSchema, findBarcodeConflict } from './product-variants.js';
import { ensureProductCatalogSchema, setVariantAttributes } from './product-catalog.js';
import { lockCatalogWrite } from './retail-catalog-lock.js';
import { internalCatalogBarcode } from './retail-merchandising.js';

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const ALIASES = { color: 'colour', product: 'name', product_name: 'name', selling_price: 'price', wholesale: 'wholesale_price' };
const column = (key) => { const name = String(key).trim().toLowerCase().replace(/[\s-]+/g, '_'); return ALIASES[name] || name; };
const label = (key) => key.replace('_', ' ');

/**
 * Bulk product upload check. Rows with the same name become one product; colour and
 * size make its versions. Products whose name already exists are skipped, never changed.
 * Writes nothing. Stock is not imported: it goes through Inventory so costs post correctly.
 */
export async function planProductImport(db, csv) {
  const rows = parseCatalogCsv(csv).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [column(key), String(value ?? '').trim()])));
  const columns = Object.keys(rows[0]);
  if (!columns.includes('name') || !columns.includes('price')) throw bad('The file needs "name" and "price" columns. Download the sample to see the layout.');
  const errors = [];
  const products = new Map();
  const barcodes = new Map();
  const skus = new Map();
  rows.forEach((row, index) => {
    const line = index + 2;
    const problem = (message) => errors.push({ line, message });
    const amount = (key, required = false) => {
      const text = String(row[key] || '').replace(/^rs\.?\s*/i, '').replaceAll(',', '');
      if (!text) { if (required) problem(`${label(key)} is empty`); return null; }
      const value = Number(text);
      if (!Number.isFinite(value) || value < 0 || value > 999999999) { problem(`${label(key)} "${row[key]}" is not a valid amount`); return null; }
      return Math.round(value * 100) / 100;
    };
    if (!row.name) return problem('name is empty');
    if (row.name.length > 160) return problem('name is longer than 160 characters');
    const price = amount('price', true);
    const mrp = amount('mrp');
    const wholesale = amount('wholesale_price');
    const barcode = row.barcode || '';
    const sku = row.sku || '';
    if (/^\d+(\.\d+)?e\+?\d+$/i.test(barcode)) problem(`barcode "${barcode}" was changed by Excel. Format the barcode column as Text and type it again`);
    else if (barcode && !/^[\x20-\x7e]{1,128}$/.test(barcode)) problem(`barcode "${barcode}" can only use English letters, numbers and symbols`);
    else if (barcode && barcodes.has(barcode)) problem(`barcode ${barcode} is also on row ${barcodes.get(barcode)}`);
    else if (barcode) barcodes.set(barcode, line);
    if (sku.length > 94) problem('SKU is longer than 94 characters');
    else if (sku && skus.has(sku.toLowerCase())) problem(`SKU ${sku} is also on row ${skus.get(sku.toLowerCase())}`);
    else if (sku) skus.set(sku.toLowerCase(), line);
    const attributes = {};
    if (row.colour) attributes.Colour = row.colour;
    if (row.size) attributes.Size = row.size;
    if (Object.values(attributes).some((value) => value.length > 120)) problem('colour and size must be 120 characters or fewer');
    const key = row.name.toLowerCase();
    if (!products.has(key)) products.set(key, { name: row.name, category: row.category || '', brand: row.brand || '', description: row.description || '', versions: [] });
    const product = products.get(key);
    const variant_name = Object.values(attributes).join(' / ') || 'Standard';
    const clash = product.versions.find((version) => version.variant_name.toLowerCase() === variant_name.toLowerCase());
    if (clash && variant_name !== 'Standard') problem(`${row.name} ${variant_name} is also on row ${clash.line}`);
    product.versions.push({ line, variant_name, attributes, price, mrp, wholesale_price: wholesale, barcode, sku });
  });

  const list = [...products.values()];
  for (const product of list) {
    if (product.versions.length > 1) for (const version of product.versions) if (version.variant_name === 'Standard') errors.push({ line: version.line, message: `${product.name} is on several rows, so each row needs a colour or size` });
    product.status = await db.get('SELECT id FROM products WHERE LOWER(name)=LOWER(?) LIMIT 1', [product.name]) ? 'exists' : 'new';
    if (product.status === 'exists') continue;
    const category = product.category ? await db.get('SELECT id FROM product_categories WHERE LOWER(name)=LOWER(?) ORDER BY id LIMIT 1', [product.category]) : null;
    product.category_id = category?.id ?? null;
    product.new_category = !!product.category && !category;
    for (const version of product.versions) {
      if (version.barcode && await findBarcodeConflict(db, [version.barcode])) errors.push({ line: version.line, message: `barcode ${version.barcode} already belongs to another product` });
      if (version.sku && await db.get('SELECT id FROM product_variants WHERE LOWER(sku)=LOWER(?) LIMIT 1', [version.sku])) errors.push({ line: version.line, message: `SKU ${version.sku} is already used by another product` });
    }
  }
  errors.sort((a, b) => a.line - b.line);
  const fresh = list.filter((product) => product.status === 'new');
  return {
    products: list,
    errors,
    ignored_columns: columns.filter((name) => !PRODUCT_CSV_COLUMNS.includes(name)),
    new_categories: [...new Map(fresh.filter((product) => product.new_category).map((product) => [product.category.toLowerCase(), product.category])).values()],
    counts: { rows: rows.length, products: fresh.length, versions: fresh.reduce((sum, product) => sum + product.versions.length, 0), skipped: list.length - fresh.length },
  };
}

/** All or nothing: the file is checked again inside the transaction and any problem aborts it. */
export async function importProducts(db, csv) {
  await ensureProductVariantsSchema(db);
  await ensureProductCatalogSchema(db);
  return db.transaction(async (tx) => {
    await lockCatalogWrite(tx);
    const plan = await planProductImport(tx, csv);
    if (plan.errors.length) throw bad(`Row ${plan.errors[0].line}: ${plan.errors[0].message}. Fix the file and check it again.`);
    if (!plan.counts.products) throw bad('Nothing new to add. Every product in this file is already in Products.');
    const categories = new Map();
    const variantIds = [];
    for (const product of plan.products.filter((row) => row.status === 'new')) {
      const categoryName = product.category || 'Uncategorized';
      let categoryId = product.category_id ?? categories.get(categoryName.toLowerCase());
      if (!categoryId) {
        categoryId = (await tx.get('SELECT id FROM product_categories WHERE LOWER(name)=LOWER(?) ORDER BY id LIMIT 1', [categoryName]))?.id
          ?? (await tx.run('INSERT INTO product_categories(name,online_enabled) VALUES (?,1)', [categoryName])).lastInsertRowid;
        categories.set(categoryName.toLowerCase(), categoryId);
      }
      // No barcode in the file = the shop's own number code, so labels print straight away.
      const codes = product.versions.map((version) => version.barcode || internalCatalogBarcode());
      const single = product.versions.length === 1;
      const id = (await tx.run('INSERT INTO products(name,base_price,barcode,is_available,online_enabled,category_id,brand,description) VALUES (?,?,?,1,1,?,?,?)',
        [product.name, product.versions[0].price, single ? codes[0] : null, categoryId, product.brand || null, product.description || null])).lastInsertRowid;
      for (const [index, version] of product.versions.entries()) {
        const variantId = (await tx.run('INSERT INTO product_variants(product_id,variant_name,price,price_modifier,is_default,sku,barcode,tracking_mode,mrp,wholesale_price) VALUES (?,?,?,0,?,?,?,?,?,?)',
          [id, version.variant_name, version.price, index === 0 ? 1 : 0, version.sku || null, codes[index], 'none', version.mrp, version.wholesale_price])).lastInsertRowid;
        if (Object.keys(version.attributes).length) await setVariantAttributes(tx, variantId, version.attributes);
        variantIds.push(variantId);
      }
    }
    return { ...plan.counts, variant_ids: variantIds };
  });
}
