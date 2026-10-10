import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getRetailCustomer } from '@/lib/retail-customers.js';

export async function GET(request, { params }) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager', 'accountant'], permission: 'customers.access' });
    if (auth.error) return auth.error;
    const { id } = await params;
    const data = await getRetailCustomer(Database.getInstance(), Number(id), { includePrivate: auth.user.role === 'admin' });
    return data ? NextResponse.json(data) : NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  } catch (error) { return handleRouteError(error, 'Could not load Retail customer.'); }
}
