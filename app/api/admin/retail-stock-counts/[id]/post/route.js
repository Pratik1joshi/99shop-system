import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { postStockCount } from '@/lib/retail-stock-counts.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.count.approve' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const count = await postStockCount(db, id, { approvedBy: auth.user.id });
    return NextResponse.json({ message: 'Stock count posted', retail_stock_count: count });
  } catch (error) {
    return handleRouteError(error, 'Failed to post stock count');
  }
}
