import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { listRetailCustomers, retailCustomerAttention } from '@/lib/retail-customers.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager', 'accountant'], permission: 'customers.access' });
    if (auth.error) return auth.error;
    const p = new URL(request.url).searchParams;
    if (p.get('view') === 'attention') return NextResponse.json(await retailCustomerAttention(Database.getInstance()));
    return NextResponse.json(await listRetailCustomers(Database.getInstance(), {
      q: p.get('q'), filter: p.get('filter'), page: p.get('page'), pageSize: p.get('page_size'),
    }));
  } catch (error) { return handleRouteError(error, 'Could not load Retail customers.'); }
}
