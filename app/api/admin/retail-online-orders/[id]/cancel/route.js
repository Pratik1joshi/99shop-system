import {staffOrderView} from '@/lib/retail-order-view.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { cancelOnlineOrder } from '@/lib/retail-online-orders.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_online_orders.manage' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const data = await request.json().catch(() => ({}));
    const db = Database.getInstance();
    const order = await cancelOnlineOrder(db, id, { reason: data.reason, cancelledBy: auth.user.id });
    return NextResponse.json({ message: 'Order cancelled', retail_online_order: staffOrderView(order) });
  } catch (error) {
    return handleRouteError(error, 'Failed to cancel order');
  }
}
