import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { quoteRedemption, estimateEarnedPoints, getLoyaltyBalance } from '@/lib/retail-loyalty.js';

// POS preview: given a customer + cart total + requested points, shows the
// redemption value before checkout re-validates it authoritatively.
export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;
    const data = await request.json();
    const db = Database.getInstance();
    const [balance, estimatedEarn] = await Promise.all([
      data.customer_id ? getLoyaltyBalance(db, data.customer_id) : 0,
      estimateEarnedPoints(db, data.sale_total),
    ]);
    let redemption = { points: 0, value: 0 };
    if (data.customer_id && Number(data.points) > 0) {
      redemption = await quoteRedemption(db, { customerId: data.customer_id, points: data.points, saleTotal: data.sale_total });
    }
    return NextResponse.json({ balance, estimated_points_to_earn: estimatedEarn, redemption });
  } catch (error) {
    return handleRouteError(error, 'Could not quote loyalty redemption');
  }
}
