import Database from '@/lib/db/index';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { SEED_IMAGES } from '@/lib/storefront-seed-images.js';
import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';

/**
 * Read model for the public storefront.
 *
 * The shop's catalogue lives in `menu_categories` / `menu_items` — the same
 * rows the till and the admin product screen write. Nothing here is cached or
 * duplicated, so a product added at the counter shows on the website on the
 * next request.
 *
 * Only `is_available` products of `is_active` categories are ever returned:
 * the storefront must never advertise something the shop has switched off.
 */

/** URL-safe slug for a category name. `Charms & Keychains` -> `charms-keychains`. */
export function categorySlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Stock photos shipped with the site, used when a product has no uploaded
 * image yet. Keyed by product name so the original storefront's photography
 * survives until the shop uploads its own.
 */


/** Category artwork for categories whose products carry no image at all. */
const CATEGORY_IMAGES = {
  'hair-clips': '/storefront/hair-claws-and-clips.jpg',
  'cherry': '/storefront/cherry-charms.jpg',
  'charms-keychains': '/storefront/keychains-and-charms.jpg',
};

function productImage(row) {
  return (
    toPublicImageUrl(row.image_url) ||
    SEED_IMAGES[String(row.name || '').trim().toLowerCase()] ||
    null
  );
}

function shapeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.online_slug || categorySlug(row.name) || String(row.id),
    description: row.online_description || row.description || '',
    summary: row.online_summary || '',
    price: Number(row.base_price) || 0,
    image: productImage(row),
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    categorySlug: row.category_name ? categorySlug(row.category_name) : null,
    available: Number(row.is_available) === 1 && Number(row.category_active ?? 1) === 1,
    onlineReady: Number(row.online_enabled) === 1 && Number(row.online_category_enabled) === 1 && Number(row.online_category_active) === 1 && Number(row.has_online_variant) === 1,
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    updatedAt: row.updated_at || row.created_at || null,
  };
}

const PRODUCT_COLUMNS = `
  mi.id, mi.name, mi.description, mi.category_id, mi.base_price, mi.image_url,
  mi.is_available, mi.online_slug, mi.online_summary, mi.online_description,
  mi.online_enabled,
  mi.seo_title, mi.seo_description, mi.created_at, mi.updated_at,
  mc.name AS category_name, mc.is_active AS category_active,
  (SELECT oc.online_enabled FROM menu_categories oc WHERE oc.id = COALESCE(mi.online_category_id, mi.category_id)) AS online_category_enabled,
  (SELECT oc.merchandising_active * oc.is_active FROM menu_categories oc WHERE oc.id = COALESCE(mi.online_category_id, mi.category_id)) AS online_category_active,
  EXISTS(SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id = mi.id AND v.merchandising_active = 1) AS has_online_variant
`;

/**
 * Product pages live at /products/<slug>. A product's slug is written once,
 * the first time it is listed, and never recomputed from the name — so
 * renaming a product keeps its address and every shared link keeps working.
 * The owner can still set a slug by hand in Merchandising.
 */
async function assignProductSlugs(db) {
  const rows = await db.all("SELECT id, name FROM menu_items WHERE is_available = 1 AND (online_slug IS NULL OR online_slug = '')");
  for (const row of rows) {
    const base = categorySlug(row.name) || 'product';
    const taken = await db.get('SELECT id FROM menu_items WHERE online_slug = ? AND id <> ?', [base, row.id]);
    try {
      await db.run("UPDATE menu_items SET online_slug = ? WHERE id = ? AND (online_slug IS NULL OR online_slug = '')", [taken ? `${base}-${row.id}` : base, row.id]);
    } catch {
      // Another request claimed the same slug first; this row is picked up next time.
    }
  }
}

async function ready() {
  const db = Database.getInstance();
  await ensureRetailCommerceSchema(db); // SQLite gets the catalogue columns here; no-op on PostgreSQL.
  await assignProductSlugs(db);
  return db;
}

export async function isOnlineOrderingEnabled() {
  const db = await ready();
  const settings = await db.get('SELECT enabled, guest_enabled FROM retail_online_settings WHERE id = 1');
  return Number(settings?.enabled) === 1 && Number(settings?.guest_enabled) === 1;
}

/** Every category that currently has something to sell, in display order. */
export async function getStorefrontCategories() {
  const db = await ready();
  const rows = await db.all(
    `SELECT mc.id, mc.name, mc.description, mc.display_order, mc.image_url, mc.online_enabled, mc.merchandising_active,
            COUNT(mi.id) AS product_count,
            MIN(CASE WHEN mi.image_url IS NOT NULL AND mi.image_url <> '' THEN mi.image_url END) AS sample_image,
            MIN(mi.name) AS sample_name,
            MAX(COALESCE(mi.updated_at, mi.created_at)) AS last_changed
       FROM menu_categories mc
       LEFT JOIN menu_items mi
         ON mi.category_id = mc.id AND mi.is_available = 1
      WHERE mc.is_active = 1
      GROUP BY mc.id, mc.name, mc.description, mc.display_order, mc.image_url, mc.online_enabled, mc.merchandising_active
      HAVING COUNT(mi.id) > 0 OR mc.image_url LIKE '/storefront/catalog/categories/%'
      ORDER BY mc.display_order, mc.name`
  );

  return rows.map((row) => {
    const slug = categorySlug(row.name);
    return {
      id: row.id,
      onlineReady: Boolean(Number(row.online_enabled) && Number(row.merchandising_active)),
      name: row.name,
      description: row.description || '',
      slug,
      productCount: Number(row.product_count) || 0,
      hasCategoryCover: String(row.image_url || '').startsWith('/storefront/catalog/categories/'),
      updatedAt: row.last_changed || null,
      image:
        toPublicImageUrl(row.image_url) ||
        toPublicImageUrl(row.sample_image) ||
        SEED_IMAGES[String(row.sample_name || '').trim().toLowerCase()] ||
        CATEGORY_IMAGES[slug] ||
        null,
    };
  });
}

/** One category by its slug, or null. Slugs are derived, so match in JS. */
export async function getCategoryBySlug(slug) {
  const categories = await getStorefrontCategories();
  return categories.find((c) => c.slug === slug) || null;
}

export async function getProductsByCategoryId(categoryId) {
  const db = await ready();
  const rows = await db.all(
    `SELECT ${PRODUCT_COLUMNS}
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.is_available = 1 AND mi.category_id = ?
      ORDER BY mi.display_order, mi.name`,
    [categoryId]
  );
  return rows.map(shapeProduct);
}

/** Home page strip — the newest available products across the whole shop. */
export async function getFeaturedProducts(limit = 8, { onlineOnly = false } = {}) {
  const db = await ready();
  const rows = await db.all(
    `SELECT ${PRODUCT_COLUMNS}
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.is_available = 1 AND mc.is_active = 1
        ${onlineOnly ? `AND mi.online_enabled = 1
          AND EXISTS(SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id = mi.id AND v.merchandising_active = 1)
          AND EXISTS(SELECT 1 FROM menu_categories oc WHERE oc.id = COALESCE(mi.online_category_id, mi.category_id) AND oc.online_enabled = 1 AND oc.merchandising_active = 1 AND oc.is_active = 1)` : ''}
      ORDER BY mi.created_at DESC, mi.id DESC
      LIMIT ?`,
    [limit]
  );
  return rows.map(shapeProduct);
}

/**
 * One product by its slug, including hidden ones so an old shared link can
 * say "not available right now" instead of a dead end. Null when no product
 * ever had this address.
 */
export async function getProductBySlug(slug) {
  const db = await ready();
  const row = await db.get(
    `SELECT ${PRODUCT_COLUMNS}
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.online_slug = ?`,
    [String(slug || '').toLowerCase()]
  );
  return row ? shapeProduct(row) : null;
}

/** A few other available pieces from the same category. */
export async function getRelatedProducts(product, limit = 4) {
  const db = await ready();
  const rows = await db.all(
    `SELECT ${PRODUCT_COLUMNS}
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.is_available = 1 AND mc.is_active = 1 AND mi.category_id = ? AND mi.id <> ?
      ORDER BY mi.display_order, mi.name
      LIMIT ?`,
    [product.categoryId, product.id, limit]
  );
  return rows.map(shapeProduct);
}

/** Every available product with an active category, for the sitemap. */
export async function getSitemapProducts() {
  const db = await ready();
  const rows = await db.all(
    `SELECT ${PRODUCT_COLUMNS}
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.is_available = 1 AND mc.is_active = 1
      ORDER BY mi.id`
  );
  return rows.map(shapeProduct);
}
