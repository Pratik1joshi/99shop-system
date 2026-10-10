import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getMovementLedger } from '@/lib/retail-inventory-reports.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const db = Database.getInstance();
    const rows = await getMovementLedger(db, {
      variantId: searchParams.get('variant_id') || undefined,
      locationId: searchParams.get('location_id') || undefined,
      batchId: searchParams.get('batch_id') || undefined,
      movementType: searchParams.get('movement_type') || undefined,
      referenceType: searchParams.get('reference_type') || undefined,
      dateFrom: searchParams.get('date_from') || undefined,
      dateTo: searchParams.get('date_to') || undefined,
      limit: searchParams.get('limit') || undefined,
    });
    return NextResponse.json({ movements: rows });
  } catch (error) {
    return handleRouteError(error, 'Could not load movement ledger.');
  }
}
