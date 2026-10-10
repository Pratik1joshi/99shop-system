import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { retailCustomerStatement } from '@/lib/retail-customer-statements.js';

export async function GET(request, { params }) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager', 'accountant'], permission: 'customer_ledger.access' });
    if (auth.error) return auth.error;
    const { id } = await params;
    const q = new URL(request.url).searchParams;
    return NextResponse.json(await retailCustomerStatement(Database.getInstance(), {
      customerId: Number(id), from: q.get('from'), to: q.get('to'),
    }));
  } catch (error) { return handleRouteError(error, 'Could not load Retail customer statement.'); }
}
