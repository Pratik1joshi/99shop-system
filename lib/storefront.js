import Database from '@/lib/db/index';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { LOGO_IMAGE } from '@/lib/storefront-links.js';

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
const SEED_IMAGES = {
  'berry cloud claw clip': '/storefront/berry-cloud-claw-clip.jpg',
  'petal cloud claw clip': '/storefront/petal-cloud-claw-clip.jpg',
  'sky gingham cloud claw clip': '/storefront/sky-gingham-cloud-claw-clip.jpg',
  'blush gingham triangle claw clip': '/storefront/blush-gingham-triangle-claw-clip.jpg',
  'heart crown claw clip': '/storefront/heart-crown-claw-clip.jpg',
  'ivory bow claw clip': '/storefront/ivory-bow-claw-clip.jpg',
  'pearl & bow claw set': '/storefront/hair-claws-and-clips.jpg',
  'glazed cherry duo keychain': '/storefront/cherry-charms.jpg',
  'cherry bag charm': '/storefront/cherry-bag-charm.jpg',
  'mystery charm keychain mix': '/storefront/keychains-and-charms.jpg',
};

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
    description: row.description || '',
    price: Number(row.base_price) || 0,
    image: productImage(row),
    categoryId: row.category_id,
    categoryName: row.category_name || null,
  };
}

const PRODUCT_COLUMNS = `
  mi.id, mi.name, mi.description, mi.category_id, mi.base_price, mi.image_url,
  mc.name AS category_name
`;

/** Every category that currently has something to sell, in display order. */
export async function getStorefrontCategories() {
  const db = Database.getInstance();
  const rows = await db.all(
    `SELECT mc.id, mc.name, mc.description, mc.display_order,
            COUNT(mi.id) AS product_count,
            MIN(CASE WHEN mi.image_url IS NOT NULL AND mi.image_url <> '' THEN mi.image_url END) AS sample_image,
            MIN(mi.name) AS sample_name
       FROM menu_categories mc
       JOIN menu_items mi
         ON mi.category_id = mc.id AND mi.is_available = 1
      WHERE mc.is_active = 1
      GROUP BY mc.id, mc.name, mc.description, mc.display_order
      HAVING COUNT(mi.id) > 0
      ORDER BY mc.display_order, mc.name`
  );

  return rows.map((row) => {
    const slug = categorySlug(row.name);
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      slug,
      productCount: Number(row.product_count) || 0,
      image:
        toPublicImageUrl(row.sample_image) ||
        SEED_IMAGES[String(row.sample_name || '').trim().toLowerCase()] ||
        CATEGORY_IMAGES[slug] ||
        LOGO_IMAGE,
    };
  });
}

/** One category by its slug, or null. Slugs are derived, so match in JS. */
export async function getCategoryBySlug(slug) {
  const categories = await getStorefrontCategories();
  return categories.find((c) => c.slug === slug) || null;
}

export async function getProductsByCategoryId(categoryId) {
  const db = Database.getInstance();
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
export async function getFeaturedProducts(limit = 8) {
  const db = Database.getInstance();
  const rows = await db.all(
    `SELECT ${PRODUCT_COLUMNS}
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
      WHERE mi.is_available = 1 AND mc.is_active = 1
      ORDER BY mi.created_at DESC, mi.id DESC
      LIMIT ?`,
    [limit]
  );
  return rows.map(shapeProduct);
}
