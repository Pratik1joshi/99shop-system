import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { completeCounting } from '@/lib/retail-stock-counts.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.count.perform' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const count = await completeCounting(db, id, { completedBy: auth.user.id });
    return NextResponse.json({ message: 'Counting complete — ready for review', retail_stock_count: count });
  } catch (error) {
    return handleRouteError(error, 'Failed to complete counting');
  }
}
