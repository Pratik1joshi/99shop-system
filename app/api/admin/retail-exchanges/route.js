import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { postExchange, listExchanges } from '@/lib/retail-exchanges.js';
import { ensurePermissionCache } from '@/lib/permissions.js';
import { commerceExchangeVisibility } from '@/lib/commerce-visibility.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_sale.view' });
    if (auth.error) return auth.error;
    const db = Database.getInstance();
    const exchanges = await listExchanges(db, {});
    return NextResponse.json({ retail_exchanges: exchanges });
  } catch (error) {
    return handleRouteError(error, 'Could not load exchanges.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_return.post' });
    if (auth.error) return auth.error;

    const data = await request.json();

    let allowNonResellable = false;
    if (data.allow_non_resellable) {
      const p = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_return.non_resellable' });
      if (p.error) return p.error;
      allowNonResellable = true;
    }
    let allowCredit = false;
    if (data.settlement_method === 'credit') {
      const c = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_sale.credit' });
      if (c.error) return c.error;
      allowCredit = true;
    }

    const idempotencyKey = String(data.idempotency_key || '').trim().slice(0, 100);
    if (!idempotencyKey) return NextResponse.json({ error: 'Missing exchange key. Please retry.' }, { status: 400 });

    const db = Database.getInstance();
    const exchange = await postExchange(db, {
      originalSaleId: data.original_sale_id,
      customerId: data.customer_id,
      cashierId: auth.user.id,
      returnLines: data.return_lines,
      newSaleLines: data.new_sale_lines,
      reason: data.reason,
      settlementMethod: data.settlement_method || 'cash',
      cashTendered: data.cash_tendered,
      allowNonResellable,
      allowCredit,
      idempotencyKey,
    });
    await ensurePermissionCache(db);
    return NextResponse.json({ message: 'Exchange completed', retail_exchange: commerceExchangeVisibility(exchange, auth.user.role) });
  } catch (error) {
    if (error.returnId) return NextResponse.json({ error: error.message, recovery: { return_id: error.returnId, return_number: error.returnNumber, store_credit_issued: error.storeCreditIssued, replacement_sale_id: error.replacementSaleId } }, { status: 409 });
    return handleRouteError(error, 'Failed to complete exchange');
  }
}
