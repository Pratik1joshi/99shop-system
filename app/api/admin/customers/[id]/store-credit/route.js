import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getStoreCreditBalance, listStoreCreditTransactions } from '@/lib/retail-store-credit.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'customers.access' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const db = Database.getInstance();
    const [balance, transactions] = await Promise.all([
      getStoreCreditBalance(db, id),
      listStoreCreditTransactions(db, id),
    ]);
    return NextResponse.json({ balance, transactions });
  } catch (error) {
    return handleRouteError(error, 'Could not load store credit.');
  }
}
