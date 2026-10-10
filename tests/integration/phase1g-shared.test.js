import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../lib/db/index.js';
import { queryRetailDocuments } from '../../lib/retail-document-query.js';
import { queryBusinessAudit } from '../../lib/business-audit-query.js';
import { recordCustomerMasterChange } from '../../lib/customer-master-audit.js';
import { AuthService } from '../../lib/auth/auth.js';
import { GET as transactions } from '../../app/api/admin/retail-transactions/route.js';
import { GET as audit } from '../../app/api/admin/retail-audit/route.js';
import { GET as analytics } from '../../app/api/admin/retail-analytics/route.js';
import { GET as finance } from '../../app/api/admin/retail-finance/route.js';
import bcrypt from 'bcryptjs';
import { listCashVariances,reviewCashVariance } from '../../lib/cash-variance-review.js';

if(!/^\/km_test_\d+_\d+$/.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Use the isolated integration runner.');
const db=Database.getInstance();
test.after(async()=>Database.close());
test('document query executes all canonical projections and bounded filters on PostgreSQL',async()=>{
  const result=await queryRetailDocuments(db,{},()=>true);
  assert.equal(result.types.length,16);
  assert.ok(result.documents.length<=30);
  await queryRetailDocuments(db,{q:"%' OR 1=1 --",product:'barcode',from:'2026-01-01',to:'2026-12-31'},()=>true);
  assert.equal((await queryRetailDocuments(db,{},()=>false)).documents.length,0);
});
test('customer master audit is atomic, records only changed master fields and preserves privacy',async()=>{
  const id=(await db.run("INSERT INTO customers(name,notes) VALUES ('Before','private note')")).lastInsertRowid;
  const before=await db.get('SELECT * FROM customers WHERE id=?',[id]);
  await db.transaction(async tx=>{
    await tx.run('UPDATE customers SET name=? WHERE id=?',['After',id]);
    await recordCustomerMasterChange(tx,{before,after:{...before,name:'After'},actorId:1,reason:'Correct spelling'});
  });
  const result=await queryBusinessAudit(db,{entity:'customer'},{owner:true});
  assert.equal(result.events[0].before.name,'Before');
  assert.equal(result.events[0].after.name,'After');
  assert.equal(result.events[0].after.notes,undefined);
  assert.equal(await recordCustomerMasterChange(db,{before,after:{...before,current_credit:500},actorId:1}),null);
  await assert.rejects(db.transaction(async tx=>{
    await tx.run('UPDATE customers SET name=? WHERE id=?',['Rollback',id]);
    await recordCustomerMasterChange(tx,{before,after:{...before,name:'Rollback'},actorId:-999});
  }));
  assert.equal((await db.get('SELECT name FROM customers WHERE id=?',[id])).name,'After');
});
test('shared APIs enforce unauthenticated access and all six persona document boundaries',async()=>{
  const request=(route,token)=>new Request(`http://localhost/api/admin/${route}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  assert.equal((await transactions(request('retail-transactions'))).status,401);
  assert.equal((await audit(request('retail-audit'))).status,401);
  const auth=new AuthService();
  for(const role of ['admin','manager','cashier','inventory_staff','purchasing_staff','accountant']){
    const username=`shared_${role}`;
    await db.run('INSERT INTO users(username,password_hash,full_name,role,is_active,must_change_password) VALUES (?,?,?,?,1,0)',[username,bcrypt.hashSync('TestOnly123',4),role,role]);
    const session=await auth.authenticate(username,'TestOnly123');
    const response=await transactions(request('retail-transactions',session.token));
    assert.equal(response.status,200,`${role}: ${JSON.stringify(await response.clone().json())}`);
    const data=await response.json();
    if(['cashier','manager','inventory_staff','purchasing_staff'].includes(role)) assert.ok(!data.types.some(x=>x.type==='journal'),role);
    if(role==='inventory_staff') assert.deepEqual(data.types.map(x=>x.type).sort(),['adjustment','count','transfer']);
    assert.equal((await audit(request('retail-audit',session.token))).status,role==='admin'?200:403,role);
    if(role==='manager') {
      const analysis=await analytics(request('retail-analytics',session.token));assert.equal(analysis.status,200,await analysis.clone().text());
      const visible=await analysis.json();assert.equal(visible.cogs,undefined);assert.equal(visible.grossProfit,undefined);assert.equal(visible.cashPosition,undefined);assert.equal(visible.netProfit,undefined);
      const finances=await finance(request('retail-finance',session.token));assert.equal(finances.status,200,await finances.clone().text());
      const summary=await finances.json();assert.equal(summary.trial_balance,null);assert.equal(summary.control.bank,null);assert.equal(summary.control.inventory,null);
    }
  }
});
test('cash review is append-audited, locks accepted decisions and never balances journals or counts',async()=>{
  const day=(await db.run("INSERT INTO business_days(business_date,status,opening_cash) VALUES ('2025-06-01','closed',100)")).lastInsertRowid;
  const session=(await db.run(`INSERT INTO business_day_sessions(business_day_id,session_number,status,opening_cash,expected_cash,counted_cash,cash_difference,closing_note,closed_at,closing_snapshot)
    VALUES (?,1,'closed',100,120,115,-5,'Till difference','2025-06-01 20:00:00',?)`,[day,JSON.stringify({cash:{breakdown:{opening:100,cash_collections:20}}})])).lastInsertRowid;
  const before=await db.get('SELECT count(*) AS n FROM journal_entries');
  const listed=await listCashVariances(db,{session_id:session});assert.equal(listed.variances[0].review_status,'UNREVIEWED');assert.equal(listed.variances[0].breakdown.opening,100);
  await assert.rejects(reviewCashVariance(db,{sessionId:session,status:'ACCEPTED',resolutionNote:'Checked'},{id:1,role:'cashier'}),{status:403});
  await reviewCashVariance(db,{sessionId:session,status:'ESCALATED',resolutionNote:'Ask shift supervisor'},{id:1,role:'manager'});
  await reviewCashVariance(db,{sessionId:session,status:'ACCEPTED',resolutionNote:'Reviewed source movements'},{id:1,role:'admin'});
  await assert.rejects(reviewCashVariance(db,{sessionId:session,status:'ESCALATED',resolutionNote:'Second decision'},{id:1,role:'admin'}),{status:409});
  assert.equal((await listCashVariances(db,{session_id:session})).variances.length,0);
  const accepted=(await listCashVariances(db,{session_id:session,status:'ACCEPTED'})).variances[0];
  assert.equal(Number(accepted.counted_cash),115);assert.equal(Number(accepted.cash_difference),-5);
  assert.equal((await db.get('SELECT count(*) AS n FROM journal_entries')).n,before.n);
  assert.equal(Number((await db.get("SELECT count(*) AS n FROM business_day_audit WHERE action='cash_variance_review' AND business_day_id=?",[day])).n),2);
});
test('explorer preserves exact ranking, pagination, split payment filters and held-sale privacy',async()=>{
  await db.run(`INSERT INTO retail_sales(sale_number,status,grand_total) SELECT 'QUERY-'||n,'COMPLETED',n FROM generate_series(1,65) n`);
  const sale=await db.get("SELECT id FROM retail_sales WHERE sale_number='QUERY-5'");
  await db.run("INSERT INTO retail_sale_payments(retail_sale_id,method,amount) VALUES (?,'cash',2),(?,'online',3)",[sale.id,sale.id]);
  const exact=await queryRetailDocuments(db,{q:'QUERY-5'},()=>true);assert.equal(exact.documents[0].number,'QUERY-5');
  assert.equal((await queryRetailDocuments(db,{payment_method:'online',type:'sale'},()=>true)).documents[0].id,sale.id);
  await queryRetailDocuments(db,{payment_method:'online',product:'not-found'},()=>true);
  await queryRetailDocuments(db,{serial:'EXACT-SERIAL'},()=>true);
  await queryRetailDocuments(db,{batch:'EXACT-BATCH',product:'not-found'},()=>true);
  const first=await queryRetailDocuments(db,{type:'sale',page_size:30},()=>true),second=await queryRetailDocuments(db,{type:'sale',page_size:30,page:2},()=>true);
  assert.equal(first.pagination.has_more,true);assert.equal(new Set([...first.documents,...second.documents].map(r=>r.key)).size,60);
  await db.run("INSERT INTO retail_sales(sale_number,status,cashier_id) VALUES ('PRIVATE-HELD','HELD',1)");
  assert.equal((await queryRetailDocuments(db,{q:'PRIVATE-HELD'},()=>true,{role:'cashier',userId:9999})).documents.length,0);
  assert.equal((await queryRetailDocuments(db,{q:'PRIVATE-HELD'},()=>true,{role:'cashier',userId:1})).documents.length,1);
});
