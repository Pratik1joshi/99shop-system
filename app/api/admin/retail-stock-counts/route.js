import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { createStockCount, listStockCounts } from '@/lib/retail-stock-counts.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const db = Database.getInstance();
    const counts = await listStockCounts(db, { status: searchParams.get('status') || null });
    return NextResponse.json({ retail_stock_counts: counts });
  } catch (error) {
    return handleRouteError(error, 'Could not load stock counts.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.count.create' });
    if (auth.error) return auth.error;
    const data = await request.json();
    const db = Database.getInstance();
    const count = await createStockCount(db, {
      locationId: data.location_id,
      countType: data.count_type,
      blind: !!data.blind,
      createdBy: auth.user.id,
      notes: data.notes,
      categoryId: data.category_id,
      variantIds: data.variant_ids,
    });
    return NextResponse.json({ message: 'Stock count started', retail_stock_count: count });
  } catch (error) {
    return handleRouteError(error, 'Failed to start stock count');
  }
}
