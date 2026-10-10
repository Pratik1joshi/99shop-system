import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getLoyaltyBalance, listLoyaltyTransactions, getCustomerTier } from '@/lib/retail-loyalty.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'customers.access' });
    if (auth.error) return auth.error;
    const { customerId } = await context.params;
    const db = Database.getInstance();
    const [balance, transactions, tier] = await Promise.all([
      getLoyaltyBalance(db, customerId),
      listLoyaltyTransactions(db, customerId),
      getCustomerTier(db, customerId),
    ]);
    return NextResponse.json({ balance, transactions, tier });
  } catch (error) {
    return handleRouteError(error, 'Could not load loyalty account.');
  }
}
