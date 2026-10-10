import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { adjustStoreCredit } from '@/lib/retail-store-credit.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_store_credit.adjust' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const data = await request.json();
    const idempotencyKey = String(data.idempotency_key || '').trim().slice(0, 100);
    if (!idempotencyKey) return NextResponse.json({ error: 'Missing adjustment key. Please retry.' }, { status: 400 });
    const db = Database.getInstance();
    const result = await adjustStoreCredit(db, {
      customerId: id,
      amount: data.amount,
      reason: data.reason,
      createdBy: auth.user.id,
      idempotencyKey,
    });
    return NextResponse.json({ message: 'Store credit adjusted', ...result });
  } catch (error) {
    return handleRouteError(error, 'Failed to adjust store credit');
  }
}
