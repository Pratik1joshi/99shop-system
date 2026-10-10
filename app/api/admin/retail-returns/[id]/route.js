import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getReturn } from '@/lib/retail-returns.js';
import { ensurePermissionCache } from '@/lib/permissions.js';
import { commerceReturnVisibility } from '@/lib/commerce-visibility.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'accountant'], permission: 'retail_sale.view' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const db = Database.getInstance();
    const ret = await getReturn(db, id);
    if (!ret) return NextResponse.json({ error: 'Return not found.' }, { status: 404 });
    await ensurePermissionCache(db);
    return NextResponse.json({ retail_return: commerceReturnVisibility(ret, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Could not load return.');
  }
}
