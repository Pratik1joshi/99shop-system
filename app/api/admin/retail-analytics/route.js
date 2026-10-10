import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { analyticsVisibility } from '@/lib/retail-finance-visibility.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';
import { refreshCashClosingConfig,cashClosingPolicy } from '@/lib/cash-closing-policy.js';
import {
  getExecutiveDashboard, getSalesByDimension, getProductPerformance, getCustomerAnalytics,
  getPromotionAnalytics, getLoyaltyAnalytics, getReturnsAnalytics, getPurchaseAnalytics,
} from '@/lib/retail-analytics.js';

// One route, dispatched by `report` — keeps the analytics surface in one
// place rather than a dozen near-identical route files for a bounded set of
// read-only reports (spec explicit: not an open-ended BI system).
export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_analytics.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const report = searchParams.get('report') || 'dashboard';
    const from = searchParams.get('from') || null;
    const to = searchParams.get('to') || null;
    const db = Database.getInstance();
    await refreshCashClosingConfig(db);
    const can=key=>isPermissionAllowedSync(auth.user.role,key);
    if(report==='purchases'&&!can('retail_purchasing.view_cost'))return NextResponse.json({error:'You do not have access to purchasing analysis.'},{status:403});
    if(['customers','loyalty'].includes(report)&&!can('customers.access'))return NextResponse.json({error:'You do not have access to customer analysis.'},{status:403});
    const respond=value=>NextResponse.json(analyticsVisibility(value,{can,cashVisible:cashClosingPolicy(auth.user).expectedCashVisible}),{headers:{'Cache-Control':'private, no-store'}});

    switch (report) {
      case 'dashboard':
        return respond(await getExecutiveDashboard(db, { from, to }));
      case 'sales':
        return respond({ rows: await getSalesByDimension(db, { from, to, groupBy: searchParams.get('group_by') || 'product' }) });
      case 'products':
        return respond(await getProductPerformance(db, { from, to, limit: searchParams.get('limit') }));
      case 'customers':
        return respond(await getCustomerAnalytics(db, { from, to, limit: searchParams.get('limit') }));
      case 'promotions':
        return respond({ rows: await getPromotionAnalytics(db, { from, to }) });
      case 'loyalty':
        return respond(await getLoyaltyAnalytics(db));
      case 'returns':
        return respond(await getReturnsAnalytics(db, {
          from, to, condition: searchParams.get('condition') || null,
          refundMethod: searchParams.get('refund_method') || null, cashierId: searchParams.get('cashier_id') || null,
        }));
      case 'purchases':
        return respond(await getPurchaseAnalytics(db, { from, to }));
      default:
        return NextResponse.json({ error: `Unknown report "${report}".` }, { status: 400 });
    }
  } catch (error) {
    return handleRouteError(error, 'Could not load analytics.');
  }
}
