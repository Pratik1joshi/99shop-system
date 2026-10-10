import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getStockByBatch } from '@/lib/retail-inventory.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get('variant_id');
    if (!variantId) return NextResponse.json({ error: 'variant_id is required.' }, { status: 400 });
    const db = Database.getInstance();
    const rows = await getStockByBatch(db, variantId, { locationId: searchParams.get('location_id') || null });
    return NextResponse.json({ batches: rows.filter((r) => Number(r.quantity_on_hand) > 0) });
  } catch (error) {
    return handleRouteError(error, 'Could not load batches.');
  }
}
