import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getInventoryValuationDetail, reconcileInventoryValuation } from '@/lib/retail-inventory-reports.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const db = Database.getInstance();
    const [rows, reconciliation] = await Promise.all([
      getInventoryValuationDetail(db, { locationId: searchParams.get('location_id') || null }),
      reconcileInventoryValuation(db),
    ]);
    return NextResponse.json({ rows, reconciliation });
  } catch (error) {
    return handleRouteError(error, 'Could not load inventory valuation.');
  }
}
