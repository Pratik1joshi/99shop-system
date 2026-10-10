import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { queryBusinessAudit } from '@/lib/business-audit-query.js';
export async function GET(request) {
  try {
    const auth=await requireAuth(request,{roles:['admin']});
    if(auth.error) return auth.error;
    return NextResponse.json(await queryBusinessAudit(Database.getInstance(),Object.fromEntries(new URL(request.url).searchParams),{owner:true}),{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {return handleRouteError(error,'Could not load business audit evidence.');}
}
