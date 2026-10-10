import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getTransfer, cancelDraftTransfer, reverseDispatchedTransfer } from '@/lib/retail-transfers.js';

// A DRAFT cancels cleanly (no stock moved yet); a DISPATCHED transfer needs a
// reasoned reversal that returns whatever is still in transit to the source —
// see lib/retail-transfers.js's reverseDispatchedTransfer for why this is
// never a silent delete.
export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.transfer.dispatch' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const data = await request.json().catch(() => ({}));
    const db = Database.getInstance();

    const current = await getTransfer(db, id);
    if (current.status === 'DISPATCHED') {
      if (!data.reason) return NextResponse.json({ error: 'A reason is required to reverse a dispatched transfer.' }, { status: 400 });
      const transfer = await reverseDispatchedTransfer(db, id, { reversedBy: auth.user.id, reason: data.reason });
      return NextResponse.json({ message: 'Transfer reversed', retail_transfer: transfer });
    }
    const transfer = await cancelDraftTransfer(db, id, { cancelledBy: auth.user.id });
    return NextResponse.json({ message: 'Transfer cancelled', retail_transfer: transfer });
  } catch (error) {
    return handleRouteError(error, 'Failed to cancel transfer');
  }
}
