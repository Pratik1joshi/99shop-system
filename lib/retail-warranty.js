import { createHash } from 'node:crypto';
import { ensureAfterSalesSchema } from '@/lib/retail-after-sales-schema.js';
import { warrantyError as bad, warrantyExpiry, evaluateWarranty, assertClaimTransition, CUSTOMER_CLAIM_STATES } from '@/lib/retail-warranty-rules.js';
import { nextDocumentNumber } from '@/lib/document-numbers.js';
import { issueStock, receiveStock, getDefaultLocation, getQuarantineLocation } from '@/lib/retail-inventory.js';
import { dispatchOwnedRma, resolveOwnedRma } from '@/lib/retail-warranty-rma.js';
import { applySerialStockChange, ensureRetailSerialsSchema, replaceCustomerServiceSerial } from '@/lib/retail-serials.js';
import { lockRetailStock } from '@/lib/retail-stock-lock.js';
import { getAvailableToSell } from '@/lib/retail-reservations.js';
import { postJournal } from '@/lib/accounting.js';
import { currentBusinessDayId } from '@/lib/business-days.js';
import { createReturn, postReturn, ensureRetailReturnsSchema } from '@/lib/retail-returns.js';

export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const lock = db => db.driver === 'postgres' ? ' FOR UPDATE' : '';
const text = (value, max = 2000) => String(value || '').trim().slice(0, max);
const key = value => { const k = text(value, 120); if (k.length < 8) throw bad('A retry key of 8–120 characters is required.'); return k; };
const positive = value => { const n = Number(value); if (!Number.isFinite(n) || n <= 0 || n > 100000) throw bad('Enter a positive quantity.'); return n; };
const nested = tx => ({ ...tx, run: tx.run.bind(tx), get: tx.get.bind(tx), all: tx.all.bind(tx), transaction: fn => fn(tx) });
async function purchaseBatches(db,saleLineId,originClaimId=null){
  if(originClaimId)return db.all(`SELECT m.batch_id,b.batch_number,SUM(-m.quantity) AS quantity FROM inventory_movements m JOIN warranty_economics e ON m.reference_type='warranty_economic' AND m.reference_id=e.id JOIN inventory_batches b ON b.id=m.batch_id WHERE e.claim_id=? AND e.kind='REPLACEMENT' GROUP BY m.batch_id,b.batch_number`,[originClaimId]);
  return db.all('SELECT l.batch_id,b.batch_number,l.quantity FROM retail_sale_line_batches l JOIN inventory_batches b ON b.id=l.batch_id WHERE l.retail_sale_line_id=?',[saleLineId]);
}
async function event(tx, claimId, kind, actorId, data = {}) {
  await tx.run(`INSERT INTO warranty_events(claim_id,kind,actor_id,internal_note,customer_note,evidence,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?)`,
    [claimId, kind, actorId || null, text(data.note), text(data.customer_note), JSON.stringify(data.evidence || {}), data.key || null, data.hash || null]);
}
export async function saveWarrantyPolicy(db, input, actorId) {
  await ensureAfterSalesSchema(db);
  const scope = input.scope, scopeKey = scope === 'BUSINESS' ? '' : text(input.scope_key, 100);
  if (!['BUSINESS', 'BRAND', 'PRODUCT', 'SKU'].includes(scope) || (scope !== 'BUSINESS' && !scopeKey)) throw bad('Choose a policy scope.');
  warrantyExpiry(new Date(), Number(input.duration), input.duration_unit);
  if (!text(input.name) || !text(input.coverage) || !['ORIGINAL_EXPIRY','NEW_FULL','SPECIFIED'].includes(input.replacement_rule)) throw bad('Name, coverage and an explicit replacement warranty rule are required.');
  if (input.replacement_rule === 'SPECIFIED') warrantyExpiry(new Date(), Number(input.replacement_days), 'DAYS');
  return db.transaction(async tx => {
    if (tx.driver === 'postgres') await tx.get('SELECT pg_advisory_xact_lock(209109,1)');
    const previous = await tx.get('SELECT * FROM warranty_policies WHERE scope=? AND scope_key=? ORDER BY id DESC LIMIT 1', [scope, scopeKey]);
    await tx.run('UPDATE warranty_policies SET active=0 WHERE scope=? AND scope_key=?', [scope, scopeKey]);
    const id = (await tx.run(`INSERT INTO warranty_policies(name,scope,scope_key,duration,duration_unit,coverage,exclusions,proof_required,serial_required,customer_required,replacement_rule,replacement_days,version,created_by,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [text(input.name,100), scope, scopeKey, Number(input.duration), input.duration_unit, text(input.coverage), text(input.exclusions), input.proof_required ? 1 : 0, input.serial_required ? 1 : 0, input.customer_required ? 1 : 0, input.replacement_rule, input.replacement_rule === 'SPECIFIED' ? Number(input.replacement_days) : null, Number(previous?.version || 0) + 1, actorId, input.active === false ? 0 : 1])).lastInsertRowid;
    await event(tx, null, 'POLICY_VERSION', actorId, { evidence: { previous_id: previous?.id || null, policy_id: id } });
    return tx.get('SELECT * FROM warranty_policies WHERE id=?', [id]);
  });
}
// Invoked inside canonical checkout after the fulfilled sale timestamp is written.
// A no-policy snapshot is deliberate evidence; pre-upgrade sales remain manual review.
export async function snapshotSaleWarranty(tx, saleId) {
  await ensureAfterSalesSchema(tx);
  await ensureRetailSerialsSchema(tx);
  const sale = await tx.get('SELECT * FROM retail_sales WHERE id=?', [saleId]);
  if (sale.status !== 'COMPLETED') throw bad('Warranty starts only on a fulfilled sale.');
  const lines = await tx.all(`SELECT l.*,p.id AS product_id,p.brand FROM retail_sale_lines l JOIN product_variants v ON v.id=l.variant_id JOIN products p ON p.id=v.product_id WHERE l.retail_sale_id=?`, [saleId]);
  for (const line of lines) {
    const policy = await tx.get(`SELECT * FROM warranty_policies WHERE active=1 AND ((scope='SKU' AND scope_key=?) OR (scope='PRODUCT' AND scope_key=?) OR (scope='BRAND' AND scope_key=?) OR scope='BUSINESS') ORDER BY CASE scope WHEN 'SKU' THEN 1 WHEN 'PRODUCT' THEN 2 WHEN 'BRAND' THEN 3 ELSE 4 END,id DESC LIMIT 1`, [String(line.variant_id),String(line.product_id),line.brand || '']);
    const serials = await tx.all("SELECT serial_number FROM inventory_serials WHERE sale_line_id=? AND status='SOLD'", [line.id]);
    for (const serial of serials.length ? serials : [{ serial_number: '' }]) {
      await tx.run(`INSERT INTO warranty_snapshots(sale_id,sale_line_id,variant_id,customer_id,serial_number,quantity,policy_id,terms,starts_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
        [saleId,line.id,line.variant_id,sale.customer_id,serial.serial_number,serials.length ? 1 : line.quantity,policy?.id || null,JSON.stringify(policy || {}),sale.completed_at,policy ? warrantyExpiry(sale.completed_at,policy.duration,policy.duration_unit) : null]);
    }
  }
}
export async function warrantyEligibility(db, { saleLineId, serialNumber = '', customerId = null, proof = false, now = new Date(), snapshotId = null }) {
  await ensureAfterSalesSchema(db);
  await ensureRetailReturnsSchema(db);
  const line = await db.get(`SELECT l.*,s.customer_id,s.status,s.completed_at FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id WHERE l.id=?`, [saleLineId]);
  if (!line || line.status !== 'COMPLETED') throw bad('Fulfilled purchase not found.',404);
  const snapshot = snapshotId ? await db.get('SELECT * FROM warranty_snapshots WHERE id=? AND sale_line_id=? AND serial_number=?',[snapshotId,saleLineId,serialNumber]) : await db.get("SELECT * FROM warranty_snapshots WHERE sale_line_id=? AND serial_number=? AND (?<>'' OR origin_claim_id IS NULL) ORDER BY id DESC LIMIT 1", [saleLineId,serialNumber,serialNumber]);
  if(snapshotId&&!snapshot)throw bad('Coverage does not belong to this purchase identity.',404);
  const serial = serialNumber ? await db.get('SELECT * FROM inventory_serials WHERE serial_number=?',[serialNumber]) : null;
  const mode = await db.get('SELECT tracking_mode FROM product_variants WHERE id=?',[snapshot?.variant_id || line.variant_id]);
  const returned = await db.get(`SELECT COALESCE(SUM(l.quantity),0) AS quantity FROM retail_return_lines l JOIN retail_returns r ON r.id=l.retail_return_id WHERE l.original_sale_line_id=? AND r.status='POSTED'`, [saleLineId]);
  const replacement = await db.get("SELECT id FROM warranty_claims WHERE sale_line_id=? AND serial_number=? AND resolution IN ('REPLACED','SUPPLIER_REPLACED') LIMIT 1", [saleLineId,serialNumber]);
  const status = evaluateWarranty({ snapshot, now, customerId, proof,
    serialValid: mode?.tracking_mode !== 'serial' || !!serial && Number(serial.sale_line_id) === Number(saleLineId) && ['SOLD','WARRANTY_SERVICE','WARRANTY_SUPPLIER'].includes(serial.status),
    refunded: Number(returned.quantity) >= Number(line.quantity), replaced: !!serialNumber && !!replacement });
  return { status, snapshot, line, returned_quantity: Number(returned.quantity) };
}
export async function createWarrantyClaim(db, input, { actorId = null, customerId = null, selfService = false } = {}) {
  await ensureAfterSalesSchema(db);
  const requestKey = key(input.idempotency_key), serialNumber = text(input.serial_number,120), quantity = positive(input.quantity ?? 1);
  const issue = text(input.issue,100), description = text(input.description);
  if (!issue || !description) throw bad('Choose an issue and describe the problem.');
  const request = { line: Number(input.sale_line_id), snapshotId:Number(input.snapshot_id)||null, batchId:Number(input.batch_id)||null, serialNumber, quantity, issue, description, customerId, selfService, condition:selfService?'':text(input.condition),accessories:selfService?'':text(input.accessories),proof:selfService||!!input.proof };
  const hash = fingerprint(request);
  return db.transaction(async tx => {
    const line = await tx.get('SELECT retail_sale_id FROM retail_sale_lines WHERE id=?',[request.line]);
    if (!line) throw bad('Purchase not found.',404);
    const sale = await tx.get(`SELECT * FROM retail_sales WHERE id=?${lock(tx)}`,[line.retail_sale_id]);
    if (selfService && (!customerId || Number(sale.customer_id) !== Number(customerId))) throw bad('Purchase not found.',404);
    const replay = await tx.get('SELECT id,request_hash FROM warranty_claims WHERE idempotency_key=?',[requestKey]);
    if (replay) { if (replay.request_hash !== hash) throw bad('Retry key was used for different claim details.',409); return getWarrantyClaim(tx,replay.id,{ customerId: selfService ? customerId : null }); }
    const eligibility = await warrantyEligibility(tx,{ saleLineId: request.line, serialNumber, snapshotId:request.snapshotId, customerId: sale.customer_id, proof: selfService || !!input.proof });
    if (['INVALID_SERIAL','ALREADY_REFUNDED','ALREADY_REPLACED'].includes(eligibility.status) || selfService && eligibility.status !== 'COVERED') throw bad(`Claim requires staff assistance: ${eligibility.status}.`,409);
    if (serialNumber && quantity !== 1) throw bad('A serial claim must cover exactly one unit.');
    const allocated = await tx.get(`SELECT COALESCE(SUM(quantity),0) AS quantity FROM warranty_claims WHERE sale_line_id=? AND COALESCE(snapshot_id,-1)=? AND (?='' OR serial_number=?) AND ((status NOT IN ('CLOSED','CANCELLED') AND COALESCE(resolution,'') NOT IN ('REFUNDED','STORE_CREDIT')) OR resolution IN ('REPLACED','SUPPLIER_REPLACED'))`,[request.line,eligibility.snapshot?.id||-1,serialNumber,serialNumber]);
    const previouslyReturned=serialNumber||eligibility.snapshot?.origin_claim_id?0:eligibility.returned_quantity;
    if (Number(allocated.quantity) + previouslyReturned + quantity > (serialNumber ? 1 : Number(eligibility.snapshot?.quantity||eligibility.line.quantity))) throw bad('The purchase quantity is already claimed or returned.',409);
    const mode=await tx.get('SELECT tracking_mode FROM product_variants WHERE id=?',[eligibility.snapshot?.variant_id||eligibility.line.variant_id]);
    let batchId=request.batchId;
    if(mode.tracking_mode==='batch'){
      const allocations=await purchaseBatches(tx,request.line,eligibility.snapshot?.origin_claim_id);
      if(!batchId&&allocations.length===1)batchId=allocations[0].batch_id;
      if(!allocations.some(b=>Number(b.batch_id)===Number(batchId)&&Number(b.quantity)>=quantity))throw bad('Choose the original purchased batch for this quantity.');
    }else if(batchId)throw bad('This purchase is not batch tracked.');
    const number = await nextDocumentNumber(tx,{ type:'warranty_claim',prefix:'WC' });
    const id = (await tx.run(`INSERT INTO warranty_claims(claim_number,snapshot_id,sale_id,sale_line_id,variant_id,customer_id,serial_number,quantity,issue,description,condition,accessories,eligibility,channel,idempotency_key,request_hash,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [number,eligibility.snapshot?.id || null,sale.id,request.line,eligibility.snapshot?.variant_id || eligibility.line.variant_id,sale.customer_id,serialNumber,quantity,issue,description,selfService ? '' : text(input.condition),selfService ? '' : text(input.accessories),eligibility.status,selfService ? 'CUSTOMER_ACCOUNT':'STAFF',requestKey,hash,actorId])).lastInsertRowid;
    await event(tx,id,'CREATED',actorId,{ customer_note:'Your service request has been received.', evidence:{ eligibility:eligibility.status } });
    if(batchId)await tx.run('UPDATE warranty_claims SET batch_id=? WHERE id=?',[batchId,id]);
    return getWarrantyClaim(tx,id,{ customerId:selfService ? customerId:null });
  });
}
export async function getWarrantyClaim(db,id,{ customerId = null, viewCost = false } = {}) {
  const row = await db.get(`SELECT c.*,s.sale_number,p.name AS product_name,v.sku,u.name AS customer_name FROM warranty_claims c JOIN retail_sales s ON s.id=c.sale_id JOIN product_variants v ON v.id=c.variant_id JOIN products p ON p.id=v.product_id LEFT JOIN customers u ON u.id=c.customer_id WHERE c.id=?`,[id]);
  if (!row || customerId !== null && Number(row.customer_id) !== Number(customerId)) throw bad('Claim not found.',404);
  if (customerId !== null) return { id:row.id,claim_number:row.claim_number,product_name:row.product_name,serial_number:row.serial_number,issue:row.issue,description:row.description,status:CUSTOMER_CLAIM_STATES[row.status],created_at:row.created_at,
    timeline:await db.all("SELECT customer_note AS message,created_at FROM warranty_events WHERE claim_id=? AND customer_note<>'' ORDER BY id",[id]) };
  return { ...row, snapshot:row.snapshot_id ? await db.get('SELECT * FROM warranty_snapshots WHERE id=?',[row.snapshot_id]):null,
    timeline:await db.all('SELECT * FROM warranty_events WHERE claim_id=? ORDER BY id',[id]),
    inspections:await db.all('SELECT * FROM warranty_inspections WHERE claim_id=? ORDER BY id',[id]),
    repair:await db.get('SELECT * FROM warranty_repairs WHERE claim_id=?',[id]),rma:await db.get('SELECT * FROM warranty_rmas WHERE claim_id=?',[id]),
    ...(viewCost ? { economics:await db.all('SELECT * FROM warranty_economics WHERE claim_id=? ORDER BY id',[id]) }: {}) };
}
export async function listWarrantyClaims(db,{ query='',status='',customerId=null,page=1,filters={} }={}) {
  await ensureAfterSalesSchema(db);
  const where=[],params=[];
  if(status){where.push('c.status=?');params.push(status);}
  for(const [key,column] of Object.entries({eligibility:'c.eligibility',resolution:'c.resolution',issue:'c.issue',product:'p.name',brand:'p.brand',customer:'u.name',serial:'c.serial_number'})){if(filters[key]){where.push('LOWER('+column+') LIKE ?');params.push('%'+text(filters[key],100).toLowerCase()+'%');}}
  if(filters.assigned){where.push('c.assigned_to IN (SELECT id FROM users WHERE LOWER(full_name) LIKE ? OR LOWER(username) LIKE ?)');params.push(...Array(2).fill('%'+text(filters.assigned,100).toLowerCase()+'%'));}
  for(const [key,op] of [['from','>='],['to','<=']]){if(filters[key]){if(!/^\d{4}-\d{2}-\d{2}$/.test(filters[key]))throw bad('Invalid claim date filter.');where.push('DATE(c.created_at)'+op+'?');params.push(filters[key]);}}

  if(customerId){where.push('c.customer_id=?');params.push(customerId);}
  if(query){where.push('(LOWER(c.claim_number) LIKE ? OR LOWER(c.serial_number) LIKE ? OR LOWER(p.name) LIKE ? OR LOWER(u.name) LIKE ? OR u.phone LIKE ?)');params.push(...Array(5).fill('%'+text(query,100).toLowerCase()+'%'));}
  return db.all(`SELECT c.id,c.claim_number,c.status,c.eligibility,c.serial_number,c.issue,c.resolution,c.created_at,c.assigned_to,p.name AS product_name,u.name AS customer_name FROM warranty_claims c JOIN product_variants v ON v.id=c.variant_id JOIN products p ON p.id=v.product_id LEFT JOIN customers u ON u.id=c.customer_id ${where.length ? 'WHERE '+where.join(' AND '):''} ORDER BY c.id DESC LIMIT 40 OFFSET ?`,[...params,(Math.max(1,Math.min(10000,Number(page)||1))-1)*40]);
}
export async function searchWarrantyPurchases(db,{ query='',customerId=null,saleId=null,page=1 }={}) {
  await ensureAfterSalesSchema(db);
  const params=[],where=["s.status='COMPLETED'"];
  if(saleId){where.push('s.id=?');params.push(saleId);}
  if(customerId){where.push('s.customer_id=?');params.push(customerId);}
  if(query){const q='%'+text(query,100).toLowerCase()+'%';where.push(`(LOWER(s.sale_number) LIKE ? OR LOWER(COALESCE(w.serial_number,sid.serial_number)) LIKE ? OR LOWER(c.name) LIKE ? OR c.phone LIKE ? OR LOWER(v.sku) LIKE ? OR LOWER(p.name) LIKE ? OR EXISTS(SELECT 1 FROM product_barcodes b WHERE b.variant_id=v.id AND LOWER(b.barcode) LIKE ?) OR EXISTS(SELECT 1 FROM retail_online_orders o WHERE o.retail_sale_id=s.id AND LOWER(o.order_number) LIKE ?))`);params.push(...Array(8).fill(q));}
  const rows=await db.all(`SELECT l.id AS sale_line_id,COALESCE(w.quantity,l.quantity) AS quantity,CASE WHEN w.origin_claim_id IS NULL THEN l.product_name_snapshot ELSE p.name END AS product_name,v.sku,s.id AS sale_id,s.sale_number,s.customer_id,s.completed_at,c.name AS customer_name,w.id AS snapshot_id,w.origin_claim_id,COALESCE(w.serial_number,sid.serial_number) AS serial_number,w.expires_at,w.policy_id FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id LEFT JOIN warranty_snapshots w ON w.sale_line_id=l.id JOIN product_variants v ON v.id=COALESCE(w.variant_id,l.variant_id) JOIN products p ON p.id=v.product_id LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN inventory_serials sid ON sid.sale_line_id=l.id AND w.id IS NULL WHERE ${where.join(' AND ')} ORDER BY CASE WHEN COALESCE(w.serial_number,sid.serial_number)=? THEN 0 ELSE 1 END,s.id DESC,l.id LIMIT 40 OFFSET ?`,[...params,text(query,120),(Math.max(1,Math.min(10000,Number(page)||1))-1)*40]);
  return Promise.all(rows.map(async r=>({...r,batches:await purchaseBatches(db,r.sale_line_id,r.origin_claim_id)})));
}

async function consumeWarrantyStock(tx,claim,input,kind,actorId) {
  const variantId=Number(input.variant_id),quantity=kind==='REPLACEMENT'?Number(claim.quantity):positive(input.quantity);
  const variant=await tx.get('SELECT tracking_mode FROM product_variants WHERE id=?',[variantId]);
  if(!variant)throw bad('SKU not found.',404);
  const location=await getDefaultLocation(tx); await lockRetailStock(tx,[variantId],location.id);
  if(await getAvailableToSell(tx,variantId,location.id)<quantity)throw bad('Insufficient unreserved sellable stock.',409);
  const serials=Array.isArray(input.serial_numbers)?input.serial_numbers.map(s=>text(s,120)):[];
  if(variant.tracking_mode==='serial'&&(serials.length!==quantity||new Set(serials).size!==quantity))throw bad('Capture one exact available serial per unit.');
  if(kind==='REPLACEMENT'&&claim.serial_number&&variant.tracking_mode!=='serial')throw bad('A serialized purchase requires a serialized replacement.');
  if(kind==='REPLACEMENT'&&variant.tracking_mode==='serial'&&quantity!==1)throw bad('Issue a serialized replacement through a single-unit claim.');
  const day=await currentBusinessDayId(tx,{required:true});
  const id=(await tx.run('INSERT INTO warranty_economics(claim_id,kind,variant_id,quantity,serial_numbers,created_by) VALUES (?,?,?,?,?,?)',[claim.id,kind,variantId,quantity,JSON.stringify(serials),actorId])).lastInsertRowid;
  const options={variantId,locationId:location.id,quantity,movementType:'INTERNAL_USE',referenceType:'warranty_economic',referenceId:id,createdBy:actorId,businessDayId:day,reason:`${claim.claim_number} ${kind}`};
  let value=0;
  if(variant.tracking_mode==='serial'){
    // Availability is verified separately because the low-level identity mover also supports quarantine.
    for(const s of serials){const row=await tx.get(`SELECT status FROM inventory_serials WHERE serial_number=?${lock(tx)}`,[s]);if(row?.status!=='IN_STOCK')throw bad('Replacement/part serial is not sellable.',409);}
    const result=await applySerialStockChange(tx,{...options,serialNumbers:serials,direction:'out',endingStatus:kind==='REPLACEMENT'?'SOLD':'CONSUMED'});value=Number(result.movement.total_cost);
    if(kind==='REPLACEMENT')for(const s of serials)await tx.run('UPDATE inventory_serials SET sale_line_id=?,sold_at=CURRENT_TIMESTAMP WHERE serial_number=?',[claim.sale_line_id,s]);
  }else for(const result of await issueStock(tx,options))value+=Number(result.movement.total_cost);
  value=Math.round(value*100)/100;
  await tx.run('UPDATE warranty_economics SET carrying_value=? WHERE id=?',[value,id]);
  if(value>0)await postJournal(tx,{source_type:'warranty_economic',source_id:id,created_by:actorId,business_day_id:day,memo:`${claim.claim_number} ${kind}`,lines:[{code:'5043',debit:value,credit:0},{code:'1210',debit:0,credit:value}]});
  return {id,variantId,serials,quantity};
}

export async function warrantyAction(db,id,input,actorId) {
  await ensureAfterSalesSchema(db);
  const requestKey=key(input.idempotency_key),hash=fingerprint(input);
  return db.transaction(async tx=>{
    const pointer=await tx.get('SELECT sale_id FROM warranty_claims WHERE id=?',[id]);if(!pointer)throw bad('Claim not found.',404);
    await tx.get(`SELECT id FROM retail_sales WHERE id=?${lock(tx)}`,[pointer.sale_id]);
    const c=await tx.get(`SELECT * FROM warranty_claims WHERE id=?${lock(tx)}`,[id]);
    const replay=await tx.get('SELECT request_hash FROM warranty_events WHERE claim_id=? AND request_key=?',[id,requestKey]);
    if(replay){if(replay.request_hash!==hash)throw bad('Retry key conflicts with the original action.',409);return getWarrantyClaim(tx,id);}
    const supplierAction=['rma','rma_receive'].includes(input.action)&&['RETAILER_QUARANTINE','RETAILER_SUPPLIER'].includes(c.custody);
    if(!supplierAction&&(['CLOSED','CANCELLED'].includes(c.status)||c.status==='RESOLVED'&&!(input.action==='transition'&&input.status==='CLOSED')))throw bad('This claim no longer accepts actions.',409);
    const action=input.action,note=text(input.note);let next=c.status;
    if(action==='note'){if(!note&&!text(input.customer_note))throw bad('Enter a note.');}
    else if(action==='inspect'){
      if(!['RECEIVED','INSPECTION'].includes(c.status))throw bad('Receive the item before inspection.',409);
      if(!text(input.observed_fault)||!text(input.test_result)||!text(input.received_condition)||!text(input.recommended_resolution))throw bad('Inspection needs condition, observed fault, test result and recommendation.');
      const eligibility=await warrantyEligibility(tx,{saleLineId:c.sale_line_id,serialNumber:c.serial_number,snapshotId:c.snapshot_id,customerId:c.customer_id,proof:!!input.proof});
      await tx.run(`INSERT INTO warranty_inspections(claim_id,received_condition,observed_fault,test_result,customer_damage,eligibility,recommended_resolution,notes,inspector_id) VALUES (?,?,?,?,?,?,?,?,?)`,[id,text(input.received_condition),text(input.observed_fault),text(input.test_result),input.customer_damage?1:0,eligibility.status,text(input.recommended_resolution,100),note,actorId]);
      await tx.run('UPDATE warranty_claims SET eligibility=? WHERE id=?',[eligibility.status,id]);next='INSPECTION';
    }else if(action==='approve'||action==='reject'){
      assertClaimTransition(c.status,action==='approve'?'APPROVED':'REJECTED');
      const inspection=await tx.get('SELECT * FROM warranty_inspections WHERE claim_id=? ORDER BY id DESC LIMIT 1',[id]);
      if(!inspection)throw bad('Inspection evidence is required.',409);
      if(action==='reject'&&!note)throw bad('Rejection requires a reason.');
      if(action==='approve'&&(c.eligibility!=='COVERED'||inspection.customer_damage)&&!text(input.override_reason))throw bad('A coverage override requires an explicit reason.');
      if(input.override_reason)await event(tx,id,'ELIGIBILITY_OVERRIDE',actorId,{note:text(input.override_reason)});
      next=action==='approve'?'APPROVED':'REJECTED';
    }else if(action==='repair'){
      if(c.status!=='APPROVED'||c.resolution)throw bad('An unresolved approved claim is required.',409);
      if(!text(input.diagnosis))throw bad('Enter the diagnosis.');
      await tx.run('INSERT INTO warranty_repairs(claim_id,technician_id,diagnosis) VALUES (?,?,?)',[id,actorId,text(input.diagnosis)]);next='REPAIR_IN_PROGRESS';
    }else if(action==='repair_update'){
      if(!['REPAIR_IN_PROGRESS','AWAITING_PARTS'].includes(c.status))throw bad('No active repair.',409);
      if(!['IN_PROGRESS','AWAITING_PART','TESTING','COMPLETED','UNREPAIRABLE'].includes(input.repair_status))throw bad('Invalid repair status.');
      if(input.repair_status==='COMPLETED'&&!text(input.work_performed))throw bad('Record the work performed.');
      await tx.run("UPDATE warranty_repairs SET status=?,work_performed=?,completed_at=CASE WHEN ?='COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE claim_id=?",[input.repair_status,text(input.work_performed),input.repair_status,id]);
      next=input.repair_status==='AWAITING_PART'?'AWAITING_PARTS':'REPAIR_IN_PROGRESS';
      if(input.repair_status==='COMPLETED'){next='READY_FOR_PICKUP';await tx.run("UPDATE warranty_claims SET resolution='REPAIRED' WHERE id=?",[id]);}
    }else if(action==='part'){
      if(c.status!=='REPAIR_IN_PROGRESS'||c.resolution)throw bad('Parts require an active unresolved repair.',409);
      await consumeWarrantyStock(tx,c,input,'PART',actorId);
    }else if(action==='replace'){
      if(c.status!=='APPROVED'||c.resolution||c.custody!=='STORE')throw bad('Replacement requires an approved unresolved claim with the original item received.',409);
      if(!['QUARANTINE','REPAIR','SUPPLIER','SCRAP'].includes(input.disposition))throw bad('Choose the defective item disposition.');
      const snapshot=await tx.get('SELECT * FROM warranty_snapshots WHERE id=?',[c.snapshot_id]);
      const terms=snapshot?JSON.parse(snapshot.terms):{};
      if(!terms.replacement_rule)throw bad('Historical replacement coverage is missing; configure and record coverage before issuing.',409);
      await lockRetailStock(tx,[c.variant_id,Number(input.variant_id)],(await getDefaultLocation(tx)).id);
      const issued=await consumeWarrantyStock(tx,c,input,'REPLACEMENT',actorId),now=new Date().toISOString();
      const expiry=terms.replacement_rule==='ORIGINAL_EXPIRY'?snapshot.expires_at:warrantyExpiry(now,terms.replacement_rule==='NEW_FULL'?terms.duration:terms.replacement_days,terms.replacement_rule==='NEW_FULL'?terms.duration_unit:'DAYS');
      await tx.run(`INSERT INTO warranty_snapshots(sale_id,sale_line_id,variant_id,customer_id,serial_number,quantity,policy_id,terms,starts_at,expires_at,origin_claim_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[c.sale_id,c.sale_line_id,issued.variantId,c.customer_id,issued.serials[0]||'',issued.quantity,snapshot.policy_id,JSON.stringify(terms),now,expiry,id]);
      await tx.run("UPDATE warranty_claims SET resolution='REPLACED',disposition=?,replacement_variant_id=?,replacement_serial=? WHERE id=?",[input.disposition,issued.variantId,issued.serials[0]||null,id]);
      if(input.disposition!=='SCRAP'){
        const quarantine=await getQuarantineLocation(tx);
        // Defective item acquired in exchange has no established recoverable value.
        // Quantity enters non-sellable canonical inventory at explicitly zero value.
        await receiveStock(tx,{variantId:c.variant_id,batchId:c.batch_id,locationId:quarantine.id,quantity:Number(c.quantity),unitCost:0,totalValue:0,movementType:'CUSTOMER_RETURN',referenceType:'warranty_defective_intake',referenceId:c.id,createdBy:actorId,reason:`${c.claim_number}: defective item, zero recoverable value`});
        await tx.run("UPDATE warranty_claims SET custody='RETAILER_QUARANTINE' WHERE id=?",[id]);
        if(c.serial_number)await tx.run("UPDATE inventory_serials SET status='QUARANTINE',location_id=? WHERE serial_number=?",[quarantine.id,c.serial_number]);
      }else{
        await tx.run("UPDATE warranty_claims SET custody='SCRAPPED' WHERE id=?",[id]);
        if(c.serial_number)await tx.run("UPDATE inventory_serials SET status='DAMAGED' WHERE serial_number=?",[c.serial_number]);
      }
      next='READY_FOR_PICKUP';
    }else if(action==='refund'){
      if(c.status!=='APPROVED'||c.resolution||c.custody!=='STORE')throw bad('Refund requires an approved received claim.',409);
      const coverage=await tx.get('SELECT origin_claim_id FROM warranty_snapshots WHERE id=?',[c.snapshot_id]);
      if(coverage?.origin_claim_id)throw bad('A replacement has no new paid sale to refund. Review the original economic resolution.',409);
      if(!['cash','bank','store_credit'].includes(input.refund_method))throw bad('Select cash, bank or store credit.');
      if(c.serial_number)await tx.run("UPDATE inventory_serials SET status='SOLD' WHERE serial_number=? AND status='WARRANTY_SERVICE'",[c.serial_number]);
      const draft=await createReturn(nested(tx),{originalSaleId:c.sale_id,cashierId:actorId,reason:`Warranty ${c.claim_number}`,lines:[{originalSaleLineId:c.sale_line_id,quantity:Number(c.quantity),condition:'DEFECTIVE',disposition:'QUARANTINE',batch_id:c.batch_id||null}]});
      await postReturn(nested(tx),draft.id,{postedBy:actorId,refundMethod:input.refund_method,idempotencyKey:`warranty-refund-${id}`,warrantyClaimId:Number(id),warrantySerial:c.serial_number,allowNonResellable:true});
      await tx.run('UPDATE warranty_claims SET resolution=?,return_id=?,custody=? WHERE id=?',[input.refund_method==='store_credit'?'STORE_CREDIT':'REFUNDED',draft.id,'RETAILER_QUARANTINE',id]);next='READY_FOR_PICKUP';
    }else if(action==='rma'){
      const owned=c.custody==='RETAILER_QUARANTINE';
      if(!owned&&(!['APPROVED','REPAIR_IN_PROGRESS'].includes(c.status)||c.custody!=='STORE'||c.resolution))throw bad('Supplier service requires an approved received item or retailer-owned quarantine item.',409);
      if(!input.supplier_id||!text(input.supplier_reference))throw bad('Supplier and dispatch reference are required.');
      if(input.grn_id&&!await tx.get("SELECT id FROM goods_receipts WHERE id=? AND supplier_id=? AND status='POSTED'",[input.grn_id,input.supplier_id]))throw bad('Source GRN does not belong to this supplier.');
      const number=await nextDocumentNumber(tx,{type:'warranty_rma',prefix:'RMA'});
      const rmaId=(await tx.run('INSERT INTO warranty_rmas(rma_number,claim_id,supplier_id,grn_id,supplier_reference,expected_date,notes) VALUES (?,?,?,?,?,?,?)',[number,id,input.supplier_id,input.grn_id||null,text(input.supplier_reference),input.expected_date||null,note])).lastInsertRowid;
      if(owned)await dispatchOwnedRma(tx,c,rmaId,actorId);
      else {await tx.run("UPDATE warranty_claims SET custody='SUPPLIER' WHERE id=?",[id]);if(c.serial_number)await tx.run("UPDATE inventory_serials SET status='WARRANTY_SUPPLIER' WHERE serial_number=?",[c.serial_number]);next='SENT_TO_SUPPLIER';}
    }else if(action==='rma_receive'){
      const rma=await tx.get(`SELECT * FROM warranty_rmas WHERE claim_id=?${lock(tx)}`,[id]);
      if(!rma||rma.status!=='SENT'||!note)throw bad('Record an outstanding supplier outcome and evidence.',409);
      if(rma.ownership==='RETAILER')await resolveOwnedRma(tx,c,rma,input,actorId);
      else {
      if(c.status!=='SENT_TO_SUPPLIER'||!['REPAIRED','REJECTED','NO_FAULT_FOUND','REPLACED'].includes(input.outcome))throw bad('Record a supported customer-owned supplier service outcome.',409);
      if(input.outcome==='REPLACED'){
        if(!c.serial_number)throw bad('Direct customer-owned supplier replacement requires exact serial identity.',409);
        const snapshot=await tx.get('SELECT * FROM warranty_snapshots WHERE id=?',[c.snapshot_id]);
        const terms=snapshot?JSON.parse(snapshot.terms):{};
        if(!terms.replacement_rule)throw bad('Explicit historical replacement coverage is required.',409);
        const serial=await replaceCustomerServiceSerial(tx,{oldSerial:c.serial_number,newSerial:input.replacement_serial,claimId:c.id,supplierId:rma.supplier_id});
        const now=new Date().toISOString(),expiry=terms.replacement_rule==='ORIGINAL_EXPIRY'?snapshot.expires_at:warrantyExpiry(now,terms.replacement_rule==='NEW_FULL'?terms.duration:terms.replacement_days,terms.replacement_rule==='NEW_FULL'?terms.duration_unit:'DAYS');
        await tx.run(`INSERT INTO warranty_snapshots(sale_id,sale_line_id,variant_id,customer_id,serial_number,quantity,policy_id,terms,starts_at,expires_at,origin_claim_id) VALUES (?,?,?,?,?,1,?,?,?,?,?)`,[c.sale_id,c.sale_line_id,c.variant_id,c.customer_id,serial,snapshot.policy_id,JSON.stringify(terms),now,expiry,c.id]);
        await tx.run("UPDATE warranty_claims SET replacement_serial=?,replacement_variant_id=?,resolution='SUPPLIER_REPLACED',custody='STORE' WHERE id=?",[serial,c.variant_id,id]);
        await tx.run('UPDATE warranty_rmas SET replacement_serial=? WHERE id=?',[serial,rma.id]);
      }else{await tx.run("UPDATE warranty_claims SET custody='STORE',resolution=? WHERE id=?",[input.outcome==='REJECTED'?'NOT_COVERED':input.outcome,id]);if(c.serial_number)await tx.run("UPDATE inventory_serials SET status='WARRANTY_SERVICE' WHERE serial_number=?",[c.serial_number]);}
      next='READY_FOR_PICKUP';
      }
      await tx.run("UPDATE warranty_rmas SET status='COMPLETED',outcome=?,notes=?,completed_at=CURRENT_TIMESTAMP WHERE claim_id=?",[input.outcome,note,id]);
    }else if(action==='transition'){
      next=input.status;assertClaimTransition(c.status,next);
      if(next==='CANCELLED'&&!note)throw bad('Cancellation requires a reason.');
      if(!['AWAITING_ITEM','RECEIVED','CANCELLED','READY_FOR_PICKUP','RESOLVED','CLOSED'].includes(next))throw bad('Use the evidence action for this transition.');
      if(next==='RECEIVED'){
        if(!text(input.condition))throw bad('Record the received physical condition.');
        await tx.run("UPDATE warranty_claims SET custody='STORE',condition=?,accessories=? WHERE id=?",[text(input.condition),text(input.accessories),id]);
        if(c.serial_number){const serial=await tx.get(`SELECT status,sale_line_id FROM inventory_serials WHERE serial_number=?${lock(tx)}`,[c.serial_number]);if(serial?.status!=='SOLD'||Number(serial.sale_line_id)!==Number(c.sale_line_id))throw bad('Serial is no longer customer-owned.',409);await tx.run("UPDATE inventory_serials SET status='WARRANTY_SERVICE' WHERE serial_number=?",[c.serial_number]);}
      }
      if(next==='READY_FOR_PICKUP'&&!c.resolution){if(!['NO_FAULT_FOUND','NOT_COVERED','PAID_REPAIR_OFFERED','MANUFACTURER_SUPPORT'].includes(input.resolution)||!note)throw bad('Record an operational outcome and reason.');await tx.run('UPDATE warranty_claims SET resolution=? WHERE id=?',[input.resolution,id]);}
      if(next==='RESOLVED'){
        if(!c.resolution||!note)throw bad('Resolution and collection evidence are required.');
        await tx.run('UPDATE warranty_claims SET custody=?,resolved_at=CURRENT_TIMESTAMP WHERE id=?',[['REPLACED','REFUNDED','STORE_CREDIT'].includes(c.resolution)?c.custody:'CUSTOMER',id]);
        if(c.resolution==='SUPPLIER_REPLACED')await tx.run("UPDATE inventory_serials SET status='SOLD' WHERE serial_number=?",[c.replacement_serial]);
        else if(c.serial_number&&!['REPLACED','REFUNDED','STORE_CREDIT'].includes(c.resolution))await tx.run("UPDATE inventory_serials SET status='SOLD' WHERE serial_number=?",[c.serial_number]);
      }
    }else throw bad('Unknown claim action.');
    await tx.run("UPDATE warranty_claims SET status=?,updated_at=CURRENT_TIMESTAMP,closed_at=CASE WHEN ?='CLOSED' THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE closed_at END WHERE id=?",[next,next,id]);
    await event(tx,id,action.toUpperCase(),actorId,{note,customer_note:input.customer_note,evidence:{from:c.status,to:next},key:requestKey,hash});
    return getWarrantyClaim(tx,id);
  });
}
