import { commerceSaleVisibility, assertHeldOwner } from '@/lib/commerce-visibility.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { checkoutSale } from '@/lib/retail-sales.js';

// Every trust boundary (discount, price override, credit) is re-checked here,
// server-side, from the authenticated user's role — never from a client-sent
// boolean. checkoutSale() itself also refuses to apply what it isn't told is
// authorized, so a route wired without these checks fails closed, not open.
export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const data = await request.json();
    const idempotencyKey = String(data.idempotency_key || '').trim().slice(0, 100);
    if (!idempotencyKey) return NextResponse.json({ error: 'Missing checkout key. Please retry.' }, { status: 400 });

    let allowDiscount = false;
    if (Number(data.discount_amount) > 0 || (data.lines || []).some((line) => Number(line.manual_discount_amount) > 0)) {
      const d = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_sale.discount' });
      if (d.error) return d.error;
      allowDiscount = true;
    }

    let allowPriceOverride = false;
    if (data.allowPriceOverride) {
      const p = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_sale.price_override' });
      if (p.error) return p.error;
      allowPriceOverride = true;
    }

    let allowCredit = false;
    if ((data.payments || []).some((p) => String(p.method).toLowerCase() === 'credit')) {
      const c = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_sale.credit' });
      if (c.error) return c.error;
      allowCredit = true;
    }

    let allowCreditOverride = false;
    if (data.credit_override_reason) {
      const approval = await requireAuth(request, { roles: ['admin', 'manager'], permission: 'retail_sale.credit_override' });
      if (approval.error) return approval.error;
      allowCreditOverride = true;
    }

    const db = Database.getInstance();
    await assertHeldOwner(db, id, auth.user);
    const sale = await checkoutSale(db, id, {
      payments: data.payments,
      lines: data.lines,
      discountAmount: data.discount_amount,
      discountReason: data.discount_reason,
      customerId: data.customer_id,
      couponCode: data.coupon_code,
      redeemLoyaltyPoints: data.redeem_loyalty_points,
      cashierId: auth.user.id,
      allowPriceOverride,
      allowCredit,
      allowCreditOverride,
      creditOverrideReason: data.credit_override_reason,
      allowDiscount,
      idempotencyKey,
    });
    return NextResponse.json({ message: 'Sale completed', retail_sale: commerceSaleVisibility(sale, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Failed to complete sale');
  }
}
