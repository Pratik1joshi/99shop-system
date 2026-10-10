import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';
import { retailChannelReport } from '@/lib/retail-analytics.js';
export async function GET(request){try{const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'retail_sale.view'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());const report=await retailChannelReport(Database.getInstance());if(!isPermissionAllowedSync(auth.user.role,'retail_inventory.view_cost'))for(const row of report.channels){delete row.cogs;delete row.gross_profit;}return NextResponse.json(report,{headers:{'Cache-Control':'private, no-store'}});}catch(e){return handleRouteError(e,'Could not load channel report');}}
