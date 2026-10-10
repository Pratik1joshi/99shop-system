import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { runRetailReconciliation } from '@/lib/retail-reconciliation.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'accountant'], permission: 'general_ledger.view' });
    if (auth.error) return auth.error;
    return NextResponse.json(await runRetailReconciliation(Database.getInstance()));
  } catch (error) {
    return handleRouteError(error, 'Could not run retail reconciliation.');
  }
}
