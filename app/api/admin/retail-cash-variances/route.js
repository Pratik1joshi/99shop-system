import {NextResponse} from 'next/server';
import Database from '@/lib/db/index';
import {requireAuth,handleRouteError} from '@/lib/api-guard.js';
import {listCashVariances,reviewCashVariance} from '@/lib/cash-variance-review.js';
import {refreshCashClosingConfig,assertCashClosingAllowed} from '@/lib/cash-closing-policy.js';
async function authorized(request){
  const auth=await requireAuth(request,{roles:['admin','manager'],permission:'business_days.view'});
  if(auth.error)return auth;
  const db=Database.getInstance();await refreshCashClosingConfig(db);assertCashClosingAllowed(auth.user);
  return {...auth,db};
}
export async function GET(request){try{const auth=await authorized(request);if(auth.error)return auth.error;
  return NextResponse.json(await listCashVariances(auth.db,Object.fromEntries(new URL(request.url).searchParams)),{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return handleRouteError(e,'Could not load cash differences.');}}
export async function POST(request){try{const auth=await authorized(request);if(auth.error)return auth.error;
  return NextResponse.json({review:await reviewCashVariance(auth.db,await request.json(),auth.user)});
}catch(e){return handleRouteError(e,'Could not save cash review.');}}
