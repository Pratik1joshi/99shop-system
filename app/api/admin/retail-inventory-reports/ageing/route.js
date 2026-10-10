import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getInventoryAgeing } from '@/lib/retail-inventory-reports.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const db = Database.getInstance();
    const result = await getInventoryAgeing(db, { locationId: searchParams.get('location_id') || null });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, 'Could not load inventory ageing.');
  }
}
