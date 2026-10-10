import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { publicCatalog,publicProduct,quoteOnlineCart,commerceError } from '@/lib/retail-storefront.js';
import { storeIdentity,publicBody,rateLimitStore,newSecret,cookieOptions,customerSession,cookieValue,hashToken } from '@/lib/retail-public-security.js';
import { publicOrder,placePublicOrder,cancelPublicOrder,repricePublicOrder } from '@/lib/retail-public-orders.js';
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
const failure=error=>reply({error:error.status?error.message:'Could not complete this request.'},error.status||500);
export async function GET(request,context){
  try{
    const {action}=await context.params,db=Database.getInstance(),params=new URL(request.url).searchParams;
    await rateLimitStore(db,'public-read',3000);
    const identity=await storeIdentity(db,request);
    if(action==='catalog')return reply(await publicCatalog(db,Object.fromEntries(params),identity));
    if(action==='product')return reply(await publicProduct(db,params.get('slug'),{page:params.get('page'),customerId:identity.customerId}));
    if(action==='session'){const response=reply({customer:identity.account});if(!identity.ownerHash)response.cookies.set('aadhar_guest',newSecret(),{...cookieOptions,maxAge:30*86400});return response;}
    if(action==='order')return reply(await publicOrder(db,params.get('id'),identity));
    if(action==='history'){
      if(!identity.customerId)throw commerceError('Sign in to see account history.',401);
      const sales=await db.all("SELECT sale_number,channel,grand_total,completed_at FROM retail_sales WHERE customer_id=? AND status='COMPLETED' ORDER BY id DESC LIMIT 50",[identity.customerId]);
      const loyalty=await db.all('SELECT type,points,balance_after,created_at FROM loyalty_transactions WHERE customer_id=? ORDER BY id DESC LIMIT 50',[identity.customerId]);
      const credit=await db.all('SELECT type,amount,balance_after,created_at FROM store_credit_transactions WHERE customer_id=? ORDER BY id DESC LIMIT 50',[identity.customerId]);
      return reply({sales,loyalty,credit});
    }
    if(action==='orders'){
      if(!identity.ownerHash)throw commerceError('Sign in or use your checkout browser.',401);
      const rows=await db.all('SELECT id,order_number,status,payment_status,total,created_at FROM retail_online_orders WHERE owner_hash=? AND id>? ORDER BY id DESC LIMIT 50',[identity.ownerHash,0]);return reply({orders:rows});
    }
    throw commerceError('Not found.',404);
  }catch(error){return failure(error);}
}
export async function POST(request,context){
  try{
    const {action}=await context.params,db=Database.getInstance(),body=await publicBody(request);
    await rateLimitStore(db,'public-write:'+action,action==='account'?60:300);
    if(action==='account'){const token=await customerSession(db,body),response=reply({ok:true});response.cookies.set('aadhar_customer',token,{...cookieOptions,maxAge:7*86400});return response;}
    if(action==='logout'){const token=cookieValue(request,'aadhar_customer');if(token)await db.run('DELETE FROM retail_customer_sessions WHERE token_hash=?',[hashToken(token)]);const response=reply({ok:true});response.cookies.set('aadhar_customer','',{...cookieOptions,maxAge:0});return response;}
    const identity=await storeIdentity(db,request);
    if(!identity.ownerHash)throw commerceError('Refresh this page to start a secure shopping session.',401);
    await rateLimitStore(db,'owner:'+identity.ownerHash+':'+action,action==='orders'?5:60);
    if(action==='quote')return reply(await quoteOnlineCart(db,body,identity));
    if(action==='orders')return reply(await placePublicOrder(db,body,identity),201);
    if(action==='cancel')return reply(await cancelPublicOrder(db,body.id,identity));
    if(action==='reprice')return reply(await repricePublicOrder(db,body,identity));
    if(action==='return-request'){
      const order=await publicOrder(db,body.id,identity);if(!order.return_help)throw commerceError('Only fulfilled orders can be returned.',409);
      const reason=String(body.reason||'').trim();if(reason.length<5||reason.length>500)throw commerceError('Enter a return reason of 5–500 characters.');
      await db.transaction(async tx=>{await tx.get(`SELECT id FROM retail_online_orders WHERE id=?${tx.driver==='postgres'?' FOR UPDATE':''}`,[order.id]);if(!await tx.get("SELECT id FROM retail_online_events WHERE order_id=? AND event='RETURN_REQUESTED'",[order.id]))await tx.run('INSERT INTO retail_online_events(order_id,event,detail) VALUES (?,?,?)',[order.id,'RETURN_REQUESTED',reason]);});
      return reply({ok:true,message:'Return request recorded. Contact the store to arrange inspection and refund.'});
    }
    throw commerceError('Not found.',404);
  }catch(error){return failure(error);}
}
