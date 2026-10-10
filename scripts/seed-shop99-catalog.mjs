/**
 * Idempotent accessories catalog seed for 99 Shop by Shahana.
 *
 * Product names and descriptions are taken verbatim from the shop's own
 * storefront page — nothing is invented. That page lists no prices ("Message
 * for price"), so every item is seeded at the shop's Rs 99 price point and is
 * expected to be corrected in Products wherever an item is not actually 99.
 *
 * Items are keyed by their generated in-house barcode, so re-running updates
 * rather than duplicates. Barcodes are shop-internal CODE128 values, not
 * registered GS1 codes.
 *
 * Usage:
 *   node scripts/seed-shop99-catalog.mjs              # add/update accessories
 *   node scripts/seed-shop99-catalog.mjs --dry-run    # report only
 */
import Database from '../lib/db/index.js';

const DRY_RUN = process.argv.includes('--dry-run');

const DEFAULT_PRICE = 99;

/** display_order matters: the till grid reads top-to-bottom. */
const CATEGORIES = [
  { name: 'Hair Clips', description: 'Claw clips, cloud clips and bows.', order: 1 },
  { name: 'Charms & Keychains', description: 'Bag charms, keychains and trinkets.', order: 2 },
  { name: 'Cherry', description: 'The glossy cherry range.', order: 3 },
  { name: 'Nail Polish', description: 'Polishes and nail care.', order: 4 },
  { name: 'Cosmetics', description: 'Everyday make-up and skincare.', order: 5 },
  { name: 'Earrings', description: 'Studs, hoops and drops.', order: 6 },
  { name: 'Rings', description: 'Rings and ring sets.', order: 7 },
];

/** Verbatim from the storefront. barcode = shop-internal code printed on labels. */
const PRODUCTS = [
  { barcode: '990001', name: 'Berry Cloud Claw Clip', category: 'Hair Clips', description: 'Pink leopard-berry print on a soft cloud shape.' },
  { barcode: '990002', name: 'Petal Cloud Claw Clip', category: 'Hair Clips', description: 'Ivory cloud claw scattered with tiny pink petals.' },
  { barcode: '990003', name: 'Sky Gingham Cloud Claw Clip', category: 'Hair Clips', description: 'Blue gingham cloud claw with a lace trim and bow.' },
  { barcode: '990004', name: 'Blush Gingham Triangle Claw Clip', category: 'Hair Clips', description: 'Pink checks, blue trim, one neat little bow.' },
  { barcode: '990005', name: 'Heart Crown Claw Clip', category: 'Hair Clips', description: 'Baby-blue gingham double hearts, joined at the crown.' },
  { barcode: '990006', name: 'Ivory Bow Claw Clip', category: 'Hair Clips', description: 'Cream base, tiny florals and a hand-tied bow detail.' },
  { barcode: '990007', name: 'Pearl & Bow Claw Set', category: 'Hair Clips', description: 'Shells, starfish, bows and pearls.' },
  { barcode: '990008', name: 'Glazed Cherry Duo Keychain', category: 'Cherry', description: 'Deep-red glitter resin cherries on gold-tone hardware.' },
  { barcode: '990009', name: 'Cherry Bag Charm', category: 'Cherry', description: 'Same glossy cherry duo, styled to clip onto your favourite bag.' },
  { barcode: '990010', name: 'Mystery Charm Keychain Mix', category: 'Charms & Keychains', description: 'A rotating tray of trinkets and charms.' },
];

async function ensureCategory(db, cat) {
  const existing = await db.get('SELECT id FROM product_categories WHERE name = ?', [cat.name]);
  if (existing) return existing.id;
  if (DRY_RUN) return null;
  await db.run(
    'INSERT INTO product_categories (name, description, display_order, is_active) VALUES (?, ?, ?, 1)',
    [cat.name, cat.description, cat.order]
  );
  const row = await db.get('SELECT id FROM product_categories WHERE name = ?', [cat.name]);
  return row?.id ?? null;
}

async function upsertProduct(db, product, categoryId) {
  const existing = await db.get('SELECT id FROM products WHERE barcode = ?', [product.barcode]);
  if (existing) {
    if (!DRY_RUN) {
      await db.run(
        `UPDATE products
         SET name = ?, description = ?, category_id = ?, unit = 'pcs', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [product.name, product.description, categoryId, existing.id]
      );
    }
    return 'updated';
  }
  if (!DRY_RUN) {
    await db.run(
      `INSERT INTO products (name, description, category_id, base_price, barcode, unit, is_available)
       VALUES (?, ?, ?, ?, ?, 'pcs', 1)`,
      [product.name, product.description, categoryId, DEFAULT_PRICE, product.barcode]
    );
  }
  return 'created';
}

async function main() {
  const db = Database.getInstance();
  const categoryIds = new Map();

  for (const cat of CATEGORIES) {
    categoryIds.set(cat.name, await ensureCategory(db, cat));
  }

  let created = 0;
  let updated = 0;
  for (const product of PRODUCTS) {
    const result = await upsertProduct(db, product, categoryIds.get(product.category));
    if (result === 'created') created += 1;
    else updated += 1;
  }

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}categories: ${CATEGORIES.length}`);
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}products created: ${created}, updated: ${updated}`);
  console.log(`All items seeded at Rs ${DEFAULT_PRICE} — correct any that differ in Products.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
