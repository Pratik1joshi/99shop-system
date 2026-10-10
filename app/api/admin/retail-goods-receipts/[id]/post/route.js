import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { postGoodsReceipt } from '@/lib/retail-purchasing.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.grn.receive' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const data = await request.json().catch(() => ({}));
    let allowOverReceipt = false;
    if (data.allow_over_receipt) {
      const overAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.grn.over_receipt' });
      if (overAuth.error) return overAuth.error;
      allowOverReceipt = true;
    }

    const db = Database.getInstance();
    const grn = await postGoodsReceipt(db, id, { postedBy: auth.user.id, allowOverReceipt });
    return NextResponse.json({ message: 'Goods receipt posted', goods_receipt: redactRetailCost(grn, auth.user.role, 'retail_purchasing.view_cost') });
  } catch (error) {
    return handleRouteError(error, 'Failed to post goods receipt');
  }
}
