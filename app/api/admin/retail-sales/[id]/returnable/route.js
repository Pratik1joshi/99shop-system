import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getReturnableLines } from '@/lib/retail-returns.js';
import { commerceSaleVisibility } from '@/lib/commerce-visibility.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_return.create' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const db = Database.getInstance();
    const data = await getReturnableLines(db, id);
    const safe = commerceSaleVisibility({ ...data.sale, lines: data.lines }, auth.user.role);
    const { lines, ...sale } = safe;
    return NextResponse.json({ sale, lines });
  } catch (error) {
    return handleRouteError(error, 'Could not load returnable items.');
  }
}
