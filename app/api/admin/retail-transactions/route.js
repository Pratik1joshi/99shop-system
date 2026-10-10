import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { AuthService } from '@/lib/auth/auth.js';
import { ensurePermissionCache } from '@/lib/permissions.js';
import { queryRetailDocuments } from '@/lib/retail-document-query.js';
export async function GET(request) {
  try {
    const auth=await requireAuth(request,{roles:['admin','cashier','manager','inventory_staff','purchasing_staff','accountant']});
    if(auth.error) return auth.error;
    const db=Database.getInstance(); await ensurePermissionCache(db);
    const service=new AuthService();
    const accountingOnly=new Set(['general_ledger.view','bank.access','supplier_ledger.access','cash_drawer.manage']);
    const result=await queryRetailDocuments(db,Object.fromEntries(new URL(request.url).searchParams),key=>
      (!accountingOnly.has(key)||['admin','accountant'].includes(auth.user.role))&&service.hasPermission(auth.user.role,key),{role:auth.user.role,userId:auth.user.id});
    if(auth.user.role==='cashier') result.documents=result.documents.map(row=>({...row,href:
      ['sale','return','exchange','expense'].includes(row.type)?row.href.replace('/admin/','/cashier/'):
        ['collection','store_credit'].includes(row.type)?`/cashier/customers/${row.customer_id}`:null}));
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {return handleRouteError(error,'Could not load transactions.');}
}
