import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensureProductVariantsSchema, getVariantsByProductIds } from '@/lib/product-variants.js';
import { ensureProductCatalogSchema } from '@/lib/product-catalog.js';
import { isPermissionAllowedSync, ensurePermissionCache } from '@/lib/permissions.js';

/** Every non-primary barcode, grouped by owner, so scanning finds manufacturer/supplier/alternate codes too. */
async function getExtraBarcodes(db) {
  const rows = await db.all(
    `SELECT product_id, variant_id, barcode, barcode_type
     FROM product_barcodes WHERE is_primary = 0`
  );
  const byItem = new Map();
  const byVariant = new Map();
  for (const row of rows) {
    if (row.variant_id) {
      const list = byVariant.get(row.variant_id) || [];
      list.push(row.barcode);
      byVariant.set(row.variant_id, list);
    } else if (row.product_id) {
      const list = byItem.get(row.product_id) || [];
      list.push(row.barcode);
      byItem.set(row.product_id, list);
    }
  }
  return { byItem, byVariant };
}

/** Product list with variants, for the product pickers on Online Orders and Promotions. */
export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'catalog.view' });
    if (auth.error) return auth.error;

    const db = Database.getInstance();
    await ensureProductVariantsSchema(db);
    await ensureProductCatalogSchema(db);

    const products = await db.all(`
      SELECT mi.*, mi.base_price AS price, mc.name AS category_name
      FROM products mi
      LEFT JOIN product_categories mc ON mi.category_id = mc.id
      ORDER BY mi.name
    `);

    const variantsByItem = await getVariantsByProductIds(db, products.map((p) => p.id));
    const extraBarcodes = await getExtraBarcodes(db);
    for (const product of products) {
      product.variants = variantsByItem.get(product.id) || [];
      product.extra_barcodes = extraBarcodes.byItem.get(product.id) || [];
      for (const variant of product.variants) {
        variant.extra_barcodes = extraBarcodes.byVariant.get(variant.id) || [];
      }
    }

    await ensurePermissionCache(db);
    if (!isPermissionAllowedSync(auth.user.role, 'retail_sale.view_cost')) {
      for (const product of products) {
        delete product.cost;
        for (const variant of product.variants || []) { delete variant.cost; delete variant.unit_cost; delete variant.purchase_cost; }
      }
    }
    return NextResponse.json({ products });
  } catch (error) {
    return handleRouteError(error, 'Could not load products. Please try again.');
  }
}
