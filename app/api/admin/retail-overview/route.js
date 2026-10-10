import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getRetailOverview, overviewForRole } from '@/lib/retail-overview.js';
import { cashClosingPolicy,refreshCashClosingConfig } from '@/lib/cash-closing-policy.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'manager'], permission: 'dashboard.view' });
    if (auth.error) return auth.error;
    const db=Database.getInstance();await refreshCashClosingConfig(db);
    const overview = await getRetailOverview(db);
    return NextResponse.json(overviewForRole(overview, auth.user.role, cashClosingPolicy(auth.user).expectedCashVisible,key=>isPermissionAllowedSync(auth.user.role,key)));
  } catch (error) {
    return handleRouteError(error, 'Could not load Retail overview.');
  }
}
