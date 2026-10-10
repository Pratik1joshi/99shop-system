import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { importProducts, planProductImport } from '@/lib/retail-product-import.js';

/** Bulk product upload: { csv } checks the file, { csv, confirm: true } adds the products. */
export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'catalog.manage' });
    if (auth.error) return auth.error;
    const db = Database.getInstance();
    await ensureRetailCommerceSchema(db);
    const { csv, confirm } = await request.json();
    return NextResponse.json(confirm ? await importProducts(db, csv) : await planProductImport(db, csv));
  } catch (error) { return handleRouteError(error, 'Could not import products.'); }
}
