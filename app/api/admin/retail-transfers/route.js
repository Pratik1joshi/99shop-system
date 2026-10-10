import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { createTransfer, listTransfers } from '@/lib/retail-transfers.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const db = Database.getInstance();
    const transfers = await listTransfers(db, { status: searchParams.get('status') || null });
    return NextResponse.json({ retail_transfers: transfers });
  } catch (error) {
    return handleRouteError(error, 'Could not load transfers.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.transfer.create' });
    if (auth.error) return auth.error;
    const data = await request.json();
    const db = Database.getInstance();
    const transfer = await createTransfer(db, {
      sourceLocationId: data.source_location_id,
      destinationLocationId: data.destination_location_id,
      requestedBy: auth.user.id,
      notes: data.notes,
      reason: data.reason,
      lines: data.lines,
    });
    return NextResponse.json({ message: 'Transfer created', retail_transfer: transfer });
  } catch (error) {
    return handleRouteError(error, 'Failed to create transfer');
  }
}
