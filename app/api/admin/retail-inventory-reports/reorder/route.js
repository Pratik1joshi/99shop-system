import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getReorderSuggestions } from '@/lib/retail-inventory-reports.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // LOW_STOCK | OUT_OF_STOCK | null (both)
    const db = Database.getInstance();
    let rows = await getReorderSuggestions(db, { locationId: searchParams.get('location_id') || null });
    if (status) rows = rows.filter((r) => r.status === status);
    return NextResponse.json({ suggestions: redactRetailCost(rows, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Could not load reorder suggestions.');
  }
}
