import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getTransfer } from '@/lib/retail-transfers.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const transfer = await getTransfer(db, id);
    return NextResponse.json({ retail_transfer: redactRetailCost(transfer, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Could not load transfer.');
  }
}
