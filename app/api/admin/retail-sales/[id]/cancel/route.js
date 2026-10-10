import { commerceSaleVisibility, assertHeldOwner } from '@/lib/commerce-visibility.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { cancelHeldSale } from '@/lib/retail-sales.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const db = Database.getInstance();
    await assertHeldOwner(db, id, auth.user);
    const sale = await cancelHeldSale(db, id);
    return NextResponse.json({ message: 'Sale cancelled', retail_sale: commerceSaleVisibility(sale, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Failed to cancel sale');
  }
}
