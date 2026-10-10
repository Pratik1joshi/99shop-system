import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { rejectPurchaseOrder } from '@/lib/retail-purchasing.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.po.approve' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const data = await request.json();
    const po = await rejectPurchaseOrder(Database.getInstance(), id, { rejectedBy: auth.user.id, reason: data.reason });
    return NextResponse.json({ purchase_order: redactRetailCost(po, auth.user.role, 'retail_purchasing.view_cost') });
  } catch (error) { return handleRouteError(error, 'Could not reject purchase order.'); }
}
