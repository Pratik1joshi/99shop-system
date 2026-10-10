import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { adjustLoyaltyPoints } from '@/lib/retail-loyalty.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_loyalty.adjust' });
    if (auth.error) return auth.error;
    const { customerId } = await context.params;
    const data = await request.json();
    const db = Database.getInstance();
    const result = await adjustLoyaltyPoints(db, { customerId, points: data.points, reason: data.reason, createdBy: auth.user.id });
    return NextResponse.json({ message: 'Loyalty points adjusted', ...result });
  } catch (error) {
    return handleRouteError(error, 'Failed to adjust loyalty points');
  }
}
