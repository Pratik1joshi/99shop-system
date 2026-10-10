import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { postPurchaseReturn } from '@/lib/retail-purchasing.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.return.create' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const db = Database.getInstance();
    const ret = await postPurchaseReturn(db, id, { postedBy: auth.user.id });
    return NextResponse.json({ message: 'Purchase return posted', purchase_return: redactRetailCost(ret, auth.user.role, 'retail_purchasing.view_cost') });
  } catch (error) {
    return handleRouteError(error, 'Failed to post purchase return');
  }
}
