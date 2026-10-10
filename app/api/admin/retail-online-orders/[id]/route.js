import { staffOrderView } from '@/lib/retail-order-view.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getOnlineOrder } from '@/lib/retail-online-orders.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_online_orders.view' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const order = await getOnlineOrder(db, id);
    return NextResponse.json({ retail_online_order: staffOrderView(order) });
  } catch (error) {
    return handleRouteError(error, 'Could not load online order.');
  }
}
