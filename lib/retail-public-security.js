import { createHash,randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { commerceError } from '@/lib/retail-storefront.js';
export const hashToken=value=>createHash('sha256').update(String(value)).digest('hex');
export const newSecret=()=>randomBytes(32).toString('hex');
export const cookieOptions={httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/'};
export function cookieValue(request,name){return request.cookies?.get(name)?.value||null;}
export function assertStoreOrigin(request){
  const url=new URL(request.url);
  // Next may normalize request.url to localhost. Host retains the browser's actual authority.
  // Behind TLS termination configure NEXT_PUBLIC_SITE_URL; do not trust arbitrary forwarded headers.
  const expected=process.env.NEXT_PUBLIC_SITE_URL?new URL(process.env.NEXT_PUBLIC_SITE_URL).origin:`${url.protocol}//${request.headers.get('host')||url.host}`;
  if(request.headers.get('origin')!==expected)throw commerceError('Request origin is not allowed.',403);
}
export async function publicBody(request){
  assertStoreOrigin(request);
  if(Number(request.headers.get('content-length')||0)>32768)throw commerceError('Request is too large.',413);
  const reader=request.body?.getReader();if(!reader)throw commerceError('Invalid request.');
  let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw commerceError('Request is too large.',413);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body;}catch{throw commerceError('Invalid request.');}
}
export async function rateLimitStore(db,bucket,limit=60,seconds=60){
  const start=Math.floor(Date.now()/(seconds*1000));
  const row=await db.get(`INSERT INTO retail_public_limits(bucket,window_start,hits) VALUES (?,?,1)
    ON CONFLICT(bucket) DO UPDATE SET window_start=excluded.window_start,hits=CASE WHEN retail_public_limits.window_start=excluded.window_start THEN retail_public_limits.hits+1 ELSE 1 END RETURNING hits`,[hashToken(bucket),start]);
  if(Number(row.hits)>limit)throw commerceError('Too many requests. Please try again shortly.',429);
}
export async function storeIdentity(db,request){
  const token=cookieValue(request,'aadhar_customer');
  const account=token&&/^[a-f0-9]{64}$/.test(token)?await db.get(`SELECT a.id,a.customer_id,c.name,c.loyalty_points_balance,c.store_credit_balance FROM retail_customer_sessions s JOIN retail_customer_accounts a ON a.id=s.account_id JOIN customers c ON c.id=a.customer_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND a.active=1`,[hashToken(token)]):null;
  const guest=cookieValue(request,'aadhar_guest');
  return {customerId:account?.customer_id||null,account:account?{name:account.name,loyalty_points:Number(account.loyalty_points_balance||0),store_credit:Number(account.store_credit_balance||0)}:null,
    ownerHash:account?hashToken('customer:'+account.customer_id):guest&&/^[a-f0-9]{64}$/.test(guest)?hashToken(guest):null};
}
export async function createCustomerInvite(db,customerId,actorId){
  if(!await db.get('SELECT id FROM customers WHERE id=?',[customerId]))throw commerceError('Customer not found.',404);
  if(await db.get('SELECT id FROM retail_customer_accounts WHERE customer_id=?',[customerId]))throw commerceError('This customer already has an online account.',409);
  const token=newSecret();
  await db.run('INSERT INTO retail_customer_invites(customer_id,token_hash,expires_at,created_by) VALUES (?,?,?,?)',[customerId,hashToken(token),new Date(Date.now()+86400000).toISOString(),actorId]);
  return {activation_code:token,expires_in_hours:24};
}
export async function customerSession(db,input){
  const username=String(input.username||'').trim().toLowerCase(),password=String(input.password||'');
  if(!/^[a-z0-9_.@+-]{3,100}$/.test(username)||password.length<12||password.length>128)throw commerceError('Use a valid username and a password of 12–128 characters.');
  await rateLimitStore(db,'account:'+username,10,900);
  let account;
  if(input.action==='activate'){
    const encoded=await bcrypt.hash(password,12);
    account=await db.transaction(async tx=>{
      const invite=await tx.get(`SELECT * FROM retail_customer_invites WHERE token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP${tx.driver==='postgres'?' FOR UPDATE':''}`,[hashToken(input.activation_code||'')]);
      if(!invite)throw commerceError('Activation code is invalid or expired.',403);
      if(await tx.get('SELECT id FROM retail_customer_accounts WHERE username=? OR customer_id=?',[username,invite.customer_id]))throw commerceError('Account already exists or username is unavailable.',409);
      const id=(await tx.run('INSERT INTO retail_customer_accounts(customer_id,username,password_hash) VALUES (?,?,?)',[invite.customer_id,username,encoded])).lastInsertRowid;
      await tx.run('UPDATE retail_customer_invites SET used_at=CURRENT_TIMESTAMP WHERE customer_id=? AND used_at IS NULL',[invite.customer_id]);
      return {id};
    });
  }else{
    account=await db.get('SELECT id,password_hash FROM retail_customer_accounts WHERE username=? AND active=1',[username]);
    const valid=await bcrypt.compare(password,account?.password_hash||'$2b$12$KIX0JLbbUZjLrDyPSUlDUeDqrJiMk6SVFkUTpiZCu48NvwuYdGZ9y');
    if(!account||!valid)throw commerceError('Username or password is incorrect.',401);
  }
  const token=newSecret();await db.run('INSERT INTO retail_customer_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)',[hashToken(token),account.id,new Date(Date.now()+7*86400000).toISOString()]);return token;
}
