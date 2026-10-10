import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getAdjustment } from '@/lib/retail-inventory-adjustments.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const row = await getAdjustment(db, id);
    if (!row) return NextResponse.json({ error: 'Adjustment not found.' }, { status: 404 });
    return NextResponse.json({ retail_inventory_adjustment: redactRetailCost(row, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Could not load adjustment.');
  }
}
