import { NextResponse } from 'next/server';
import { ensureAfterSalesSchema } from '@/lib/retail-after-sales-schema.js';
import Database from '@/lib/db/index';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { skuOperations,saveOperationsPolicy,operationsDecision,forecastActual } from '@/lib/retail-operations.js';
export async function GET(request){try{
  const auth=await requireAuth(request,{permission:'operations.view'});if(auth.error)return auth.error;
  const db=Database.getInstance(),p=new URL(request.url).searchParams;let data;
  await ensureAfterSalesSchema(db);
  if(p.get('view')==='overview')data=(await db.all('SELECT s.id,s.variant_id,s.generated_at,s.evidence FROM operations_snapshots s JOIN (SELECT variant_id,MAX(id) AS latest FROM operations_snapshots GROUP BY variant_id) latest ON latest.latest=s.id ORDER BY s.id DESC LIMIT 100')).map(r=>{const e=JSON.parse(r.evidence);return {id:r.id,variant_id:r.variant_id,generated_at:r.generated_at,product_name:e.product_name,sku:e.sku,period:e.period,signals:e.signals,quality:e.quality,suggested:e.recommendation.suggested};});
  else if(p.get('snapshot_id'))data=await forecastActual(db,Number(p.get('snapshot_id')));
  else if(p.get('view')==='history')data=(await db.all('SELECT id,generated_at,horizon,evidence FROM operations_snapshots WHERE variant_id=? ORDER BY id DESC LIMIT 20',[Number(p.get('variant_id'))])).map(r=>({id:r.id,generated_at:r.generated_at,horizon:r.horizon,expected:JSON.parse(r.evidence).forecast.expected}));
  else if(p.get('variant_id'))data=await skuOperations(db,Number(p.get('variant_id')),{horizon:Number(p.get('horizon')||14)});
  else data=await db.all('SELECT v.id,v.sku,v.variant_name,p.name AS product_name FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id WHERE LOWER(p.name) LIKE ? OR LOWER(v.sku) LIKE ? ORDER BY v.id LIMIT 40 OFFSET ?',['%'+String(p.get('q')||'').toLowerCase().slice(0,100)+'%','%'+String(p.get('q')||'').toLowerCase().slice(0,100)+'%',(Math.max(1,Math.min(10000,Number(p.get('page'))||1))-1)*40]);
  return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return handleRouteError(e,'Could not load operations intelligence.');}}
export async function POST(request){try{
  const base=await requireAuth(request,{permission:'operations.view'});if(base.error)return base.error;
  const input=await request.json(),auth=await requireAuth(request,{permission:input.action==='policy'?'operations.configure':'operations.draft'});if(auth.error)return auth.error;
  const db=Database.getInstance(),data=input.action==='policy'?await saveOperationsPolicy(db,Number(input.variant_id),input.config,auth.user.id):await operationsDecision(db,input,auth.user.id);
  return NextResponse.json({data});
}catch(e){return handleRouteError(e,'Could not save operations decision.');}}
