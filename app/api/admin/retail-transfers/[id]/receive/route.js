import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { receiveTransfer } from '@/lib/retail-transfers.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.transfer.receive' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const data = await request.json();
    const db = Database.getInstance();
    const transfer = await receiveTransfer(db, id, { receivedBy: auth.user.id, lines: data.lines || [] });
    return NextResponse.json({ message: 'Transfer received', retail_transfer: transfer });
  } catch (error) {
    return handleRouteError(error, 'Failed to receive transfer');
  }
}
