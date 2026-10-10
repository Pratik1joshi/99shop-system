import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { listReminderCandidates, recordReminder } from '@/lib/retail-reminders.js';

const access = { roles: ['admin', 'cashier', 'accountant'], permission: 'customer_ledger.access' };

export async function GET(request) {
  try {
    const auth = await requireAuth(request, access);
    if (auth.error) return auth.error;
    const q = new URL(request.url).searchParams.get('q') || '';
    return NextResponse.json({ customers: await listReminderCandidates(Database.getInstance(), { q }) });
  } catch (error) { return handleRouteError(error, 'Could not load payment reminders.'); }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, access);
    if (auth.error) return auth.error;
    const data = await request.json();
    const reminder = await recordReminder(Database.getInstance(), { customerId: data.customer_id, message: data.message, actorId: auth.user.id });
    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error) { return handleRouteError(error, 'Could not record the reminder.'); }
}
