import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function ensureVarianceReviews(db){
  await ensureSqliteTable(db,`CREATE TABLE IF NOT EXISTS cash_variance_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,store_session_id INTEGER NOT NULL UNIQUE,status TEXT NOT NULL,
    resolution_note TEXT NOT NULL,reviewed_by INTEGER NOT NULL,reviewed_at DATETIME NOT NULL DEFAULT (datetime('now','+5 hours','+45 minutes')))`);
}
export async function listCashVariances(db,{page=1,status='UNREVIEWED',session_id=''}={}){
  await ensureVarianceReviews(db);
  const args=[],where=["s.status='closed'","ABS(s.cash_difference)>=0.01"];
  if(status==='UNREVIEWED')where.push('r.id IS NULL');
  else if(['ACCEPTED','ESCALATED'].includes(status)){where.push('r.status=?');args.push(status);}
  else if(status!=='ALL')fail('Choose a valid review status.');
  if(session_id){if(!/^[1-9]\d*$/.test(String(session_id)))fail('Choose a valid session.');where.push('s.id=?');args.push(Number(session_id));}
  const number=Math.min(100000,Math.max(1,parseInt(page,10)||1));
  const rows=await db.all(`SELECT s.id,s.business_day_id,s.session_number,s.drawer_session_id,s.opening_cash,s.expected_cash,s.counted_cash,s.cash_difference,
    s.closing_note,s.closed_at,s.closing_snapshot,d.business_date,u.full_name AS cashier,
    COALESCE(r.status,'UNREVIEWED') AS review_status,r.resolution_note,r.reviewed_at,reviewer.full_name AS reviewer
    FROM business_day_sessions s JOIN business_days d ON d.id=s.business_day_id LEFT JOIN users u ON u.id=s.closed_by
    LEFT JOIN cash_variance_reviews r ON r.store_session_id=s.id LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by
    WHERE ${where.join(' AND ')} ORDER BY s.closed_at DESC,s.id DESC LIMIT 31 OFFSET ?`,[...args,(number-1)*30]);
  return {variances:rows.slice(0,30).map(({closing_snapshot,...r})=>{
    let snapshot;try{snapshot=JSON.parse(closing_snapshot||'null');}catch{snapshot=null;}
    return {...r,breakdown:snapshot?.cash?.breakdown||null,tolerance:0.01};
  }),pagination:{page:number,has_more:rows.length>30},scope:'Closed store sessions with an absolute recorded cash difference of at least Rs 0.01. Breakdown is the saved closing snapshot; missing historical snapshots are not reconstructed.'};
}
export async function reviewCashVariance(db,{sessionId,status,resolutionNote},actor){
  if(!['admin','manager'].includes(actor?.role))fail('Only an Owner or Manager can review cash differences.',403);
  if(!Number.isSafeInteger(Number(sessionId))||Number(sessionId)<1)fail('Choose a valid session.');
  if(!['ACCEPTED','ESCALATED'].includes(status))fail('Choose Accepted or Escalated.');
  const note=String(resolutionNote||'').trim();if(!note||note.length>2000)fail('Enter a resolution note of at most 2,000 characters.');
  await ensureVarianceReviews(db);
  return db.transaction(async tx=>{
    const session=await tx.get(`SELECT id,business_day_id,status,cash_difference FROM business_day_sessions WHERE id=?${db.driver==='postgres'?' FOR UPDATE':''}`,[sessionId]);
    if(!session)fail('Session not found.',404);
    if(session.status!=='closed'||Math.abs(Number(session.cash_difference))<0.01)fail('Only a closed session with a recorded cash difference can be reviewed.',409);
    const prior=await tx.get('SELECT * FROM cash_variance_reviews WHERE store_session_id=?',[sessionId]);
    if(prior?.status==='ACCEPTED')fail('This cash difference has already been accepted.',409);
    await tx.run(`INSERT INTO cash_variance_reviews(store_session_id,status,resolution_note,reviewed_by) VALUES (?,?,?,?)
      ON CONFLICT(store_session_id) DO UPDATE SET status=excluded.status,resolution_note=excluded.resolution_note,reviewed_by=excluded.reviewed_by,
      reviewed_at=${db.driver==='postgres'?"(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')":"datetime('now','+5 hours','+45 minutes')"}`,[sessionId,status,note,actor.id]);
    const review=await tx.get('SELECT * FROM cash_variance_reviews WHERE store_session_id=?',[sessionId]);
    await tx.run(`INSERT INTO business_day_audit(business_day_id,action,actor_id,actor_name,previous_value,new_value,reason)
      VALUES (?,'cash_variance_review',?,?,?,?,?)`,[session.business_day_id,actor.id,actor.full_name||null,JSON.stringify(prior||{status:'UNREVIEWED'}),JSON.stringify(review),note]);
    return review;
  });
}
