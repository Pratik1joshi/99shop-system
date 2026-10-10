import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { publishOnlineProducts } from '@/lib/retail-online-publishing.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { createCustomerInvite } from '@/lib/retail-public-security.js';
import { auditPriceChange } from '@/lib/retail-price-management.js';
export async function GET(request){try{const auth=await requireAuth(request,{roles:['admin'],permission:'menu.manage'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());return NextResponse.json(await Database.getInstance().get('SELECT * FROM retail_online_settings WHERE id=1'));}catch(e){return handleRouteError(e,'Could not load storefront settings');}}
export async function POST(request){
  try{
    const auth=await requireAuth(request,{roles:['admin'],permission:'menu.manage'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const input=await request.json(),db=Database.getInstance();
    if(input.action==='bulk_online')return NextResponse.json(await publishOnlineProducts(db,input,auth.user.id));
    if(input.action==='invite'){
      if(input.identity_verified!==true)return NextResponse.json({error:'Verify customer identity before issuing an account activation code.'},{status:400});
      const result=await db.transaction(async tx=>{const invite=await createCustomerInvite(tx,Number(input.customer_id),auth.user.id);await auditPriceChange(tx,auth.user.id,'CUSTOMER_ONLINE_INVITE',Number(input.customer_id),null,{customer_id:Number(input.customer_id)},'Customer identity verified by staff');return invite;});return NextResponse.json(result);
    }
    const reason=String(input.reason||'').trim();if(!reason)throw Object.assign(new Error('Enter a change reason'),{status:400});
    const row={brand_color:String(input.brand_color||'#20372e'),logo_url:String(input.logo_url||'').trim().slice(0,2000)||null,contact_text:String(input.contact_text||'').slice(0,500),hero_text:String(input.hero_text||'').slice(0,500),guest_enabled:input.guest_enabled===false||input.guest_enabled===0?0:1,enabled:input.enabled?1:0,store_name:String(input.store_name||'').trim().slice(0,100),pickup_instructions:String(input.pickup_instructions||'').slice(0,1000),delivery_enabled:input.delivery_enabled?1:0,delivery_fee:Number(input.delivery_fee||0),free_delivery_threshold:input.free_delivery_threshold==null||input.free_delivery_threshold===''?null:Number(input.free_delivery_threshold),reservation_minutes:Number(input.reservation_minutes),manual_payment_enabled:input.manual_payment_enabled?1:0,payment_instructions:String(input.payment_instructions||'').slice(0,1000),return_policy:String(input.return_policy||'').slice(0,1000)};
    if(!/^#[0-9a-f]{6}$/i.test(row.brand_color)||(row.logo_url&&!/^\/(?:uploads|api\/media)\/menu\/[a-zA-Z0-9_.-]+$/.test(row.logo_url)))throw Object.assign(new Error('Use a #RRGGBB brand color and an uploaded menu image for the logo.'),{status:400});
    if(!row.store_name||!Number.isFinite(row.delivery_fee)||row.delivery_fee<0||row.delivery_fee>99999||row.free_delivery_threshold!=null&&(!Number.isFinite(row.free_delivery_threshold)||row.free_delivery_threshold<0)||!Number.isInteger(row.reservation_minutes)||row.reservation_minutes<15||row.reservation_minutes>1440)throw Object.assign(new Error('Check store name, delivery fee and reservation time (15–1440 minutes).'),{status:400});
    await db.transaction(async tx=>{const before=await tx.get(`SELECT * FROM retail_online_settings WHERE id=1${tx.driver==='postgres'?' FOR UPDATE':''}`);await tx.run(`UPDATE retail_online_settings SET ${Object.keys(row).map(k=>k+'=?').join(',')} WHERE id=1`,Object.values(row));await auditPriceChange(tx,auth.user.id,'STOREFRONT_SETTINGS',1,before,row,reason);});return NextResponse.json({ok:true});
  }catch(e){return handleRouteError(e,'Could not save storefront settings');}
}
