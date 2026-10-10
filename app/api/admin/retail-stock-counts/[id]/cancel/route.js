import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { cancelStockCount } from '@/lib/retail-stock-counts.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.count.create' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const count = await cancelStockCount(db, id);
    return NextResponse.json({ message: 'Stock count cancelled', retail_stock_count: count });
  } catch (error) {
    return handleRouteError(error, 'Failed to cancel stock count');
  }
}
