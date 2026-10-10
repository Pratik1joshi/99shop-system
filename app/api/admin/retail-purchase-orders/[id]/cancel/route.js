import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { cancelPurchaseOrder } from '@/lib/retail-purchasing.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.po.approve' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const data = await request.json().catch(() => ({}));
    const db = Database.getInstance();
    const po = await cancelPurchaseOrder(db, id, { reason: data.reason || null });
    return NextResponse.json({ message: 'Purchase order cancelled', purchase_order: po });
  } catch (error) {
    return handleRouteError(error, 'Failed to cancel purchase order');
  }
}
