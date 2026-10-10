import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { submitPurchaseOrder } from '@/lib/retail-purchasing.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.po.create' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const po = await submitPurchaseOrder(Database.getInstance(), id, { submittedBy: auth.user.id });
    return NextResponse.json({ purchase_order: redactRetailCost(po, auth.user.role, 'retail_purchasing.view_cost') });
  } catch (error) { return handleRouteError(error, 'Could not submit purchase order.'); }
}
