import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { createReturn, listReturnsForSale, listRecentReturns } from '@/lib/retail-returns.js';
import { ensurePermissionCache } from '@/lib/permissions.js';
import { commerceReturnVisibility } from '@/lib/commerce-visibility.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'accountant'], permission: 'retail_sale.view' });
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('sale_id');
    const db = Database.getInstance();
    const returns = saleId ? await listReturnsForSale(db, saleId) : await listRecentReturns(db);
    return NextResponse.json({ retail_returns: returns });
  } catch (error) {
    return handleRouteError(error, 'Could not load returns.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_return.create' });
    if (auth.error) return auth.error;

    const data = await request.json();
    if (data.without_receipt === true) {
      const exceptionAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_return.without_receipt' });
      if (exceptionAuth.error) return exceptionAuth.error;
    }
    const db = Database.getInstance();
    const ret = await createReturn(db, {
      original_sale_id: data.original_sale_id,
      customerId: data.customer_id,
      cashierId: auth.user.id,
      reason: data.reason,
      notes: data.notes,
      without_receipt: data.without_receipt === true,
      lines: data.lines,
    });
    await ensurePermissionCache(db);
    return NextResponse.json({ message: 'Return created', retail_return: commerceReturnVisibility(ret, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Failed to create return');
  }
}
