import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { dispatchTransfer } from '@/lib/retail-transfers.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.transfer.dispatch' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const db = Database.getInstance();
    const transfer = await dispatchTransfer(db, id, { dispatchedBy: auth.user.id });
    return NextResponse.json({ message: 'Transfer dispatched', retail_transfer: transfer });
  } catch (error) {
    return handleRouteError(error, 'Failed to dispatch transfer');
  }
}
