import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { postReturn } from '@/lib/retail-returns.js';
import { ensurePermissionCache } from '@/lib/permissions.js';
import { commerceReturnVisibility } from '@/lib/commerce-visibility.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_return.post' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const data = await request.json();

    let allowNonResellable = false;
    if (data.allow_non_resellable) {
      const p = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_return.non_resellable' });
      if (p.error) return p.error;
      allowNonResellable = true;
    }

    const idempotencyKey = String(data.idempotency_key || '').trim().slice(0, 100);
    if (!idempotencyKey) return NextResponse.json({ error: 'Missing posting key. Please retry.' }, { status: 400 });

    const db = Database.getInstance();
    const ret = await postReturn(db, id, {
      postedBy: auth.user.id,
      refundMethod: data.refund_method,
      allowNonResellable,
      idempotencyKey,
    });
    await ensurePermissionCache(db);
    return NextResponse.json({ message: 'Return posted', retail_return: commerceReturnVisibility(ret, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Failed to post return');
  }
}
