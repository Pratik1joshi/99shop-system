import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { evaluateRetailPromotions } from '@/lib/retail-promotions.js';

// Read-only — POS calls this on every cart change to show "why" a discount
// applied before checkout re-evaluates the same thing authoritatively.
export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;
    const data = await request.json();
    const db = Database.getInstance();
    const result = await evaluateRetailPromotions(db, {
      lines: data.lines || [], couponCode: data.coupon_code, customerId: data.customer_id || null,
    });
    return NextResponse.json({
      applied_promotions: result.appliedPromotions,
      total_discount: result.totalDiscount,
      line_discounts: result.items.map((item, i) => ({ variant_id: item.variant_id, discount: result.lineDiscounts.get(i) || 0 })),
    });
  } catch (error) {
    return handleRouteError(error, 'Could not evaluate promotions');
  }
}
