import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getSellableStockBulk, getDefaultLocation } from '@/lib/retail-inventory.js';

// Sellable (non-expired) stock for many variants in one call — the POS product
// list and the GRN screen both need this without an N+1 lookup per row.
export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'menu.view' });
    if (auth.error) return auth.error;

    const params = new URL(request.url).searchParams;
    const variantIds = String(params.get('variantIds') || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
    if (!variantIds.length) return NextResponse.json({ stock: {} });

    const db = Database.getInstance();
    const locationId = params.get('locationId') ? Number(params.get('locationId')) : (await getDefaultLocation(db))?.id;
    const stock = await getSellableStockBulk(db, variantIds, { locationId });
    return NextResponse.json({ stock });
  } catch (error) {
    return handleRouteError(error, 'Could not load stock levels.');
  }
}
