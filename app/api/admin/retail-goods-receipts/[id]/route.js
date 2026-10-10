import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getGoodsReceipt } from '@/lib/retail-purchasing.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.grn.receive' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const db = Database.getInstance();
    const grn = await getGoodsReceipt(db, id);
    if (!grn) return NextResponse.json({ error: 'Goods receipt not found.' }, { status: 404 });
    return NextResponse.json({ goods_receipt: redactRetailCost(grn, auth.user.role, 'retail_purchasing.view_cost') });
  } catch (error) {
    return handleRouteError(error, 'Could not load goods receipt.');
  }
}
