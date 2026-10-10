import { forecastDemand, replenishment, channelShiftSignals } from '@/lib/retail-forecast.js';
import { ensureAfterSalesSchema } from '@/lib/retail-after-sales-schema.js';
import { fingerprint } from '@/lib/retail-warranty.js';
import { warrantyError as bad } from '@/lib/retail-warranty-rules.js';
import { getDefaultLocation, getSellableStock } from '@/lib/retail-inventory.js';
import { getAvailableToSell } from '@/lib/retail-reservations.js';
import { createPurchaseOrder } from '@/lib/retail-purchasing.js';
import { getNepaliDateString } from '@/lib/time-utils.js';
const DAY=86400000;
const date=value=>new Date(value).toISOString().slice(0,10);
const number=value=>Number(value||0);
export const DEFAULT_OPERATIONS_POLICY={mode:'REORDER_POINT',coverDays:14,leadDays:0,safetyQuantity:0,safetyDays:0,maximum:0,costIncrease:.15,marginDrop:.05,returnRate:.1,minSample:30,slowDays:30,slowUnits:3,deadDays:90,discountRate:.2,salesChange:1,channelShift:.25};
function policy(input){
  const result={...DEFAULT_OPERATIONS_POLICY,...input};
  if(!['MANUAL','MIN_MAX','REORDER_POINT','FORECAST_ASSISTED'].includes(result.mode))throw bad('Invalid replenishment mode.');
  for(const key of Object.keys(DEFAULT_OPERATIONS_POLICY).filter(k=>k!=='mode')){
    result[key]=Number(result[key]);
    if(!Number.isFinite(result[key])||result[key]<0||result[key]>10000)throw bad(`Invalid ${key}.`);
  }
  if(result.minSample<10||result.deadDays<30||result.coverDays>90||result.leadDays>180||result.safetyDays>90||result.returnRate>1||result.costIncrease>5||result.marginDrop>1||result.discountRate>1||result.channelShift>1)throw bad('Threshold is outside the supported policy range.');
  return result;
}
export async function saveOperationsPolicy(db,variantId,input,actorId){
  await ensureAfterSalesSchema(db);const config=JSON.stringify(policy(input));
  return db.transaction(async tx=>{
    const sku=await tx.get(`SELECT id FROM menu_item_variants WHERE id=?${tx.driver==='postgres'?' FOR UPDATE':''}`,[variantId]);if(!sku)throw bad('SKU not found.',404);
    const before=await tx.get('SELECT config FROM operations_policies WHERE variant_id=?',[variantId]);
    await tx.run(`INSERT INTO operations_policies(variant_id,config,updated_by) VALUES (?,?,?) ON CONFLICT(variant_id) DO UPDATE SET config=excluded.config,version=operations_policies.version+1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,[variantId,config,actorId]);
    await tx.run('INSERT INTO operations_policy_audit(variant_id,before_config,after_config,actor_id) VALUES (?,?,?,?)',[variantId,before?.config||null,config,actorId]);return JSON.parse(config);
  });
}
// One selected SKU, at most 180 complete Nepal trading dates. No durable worker required.
export async function skuOperations(db,variantId,{horizon=14,asOf=new Date()}={}){
  await ensureAfterSalesSchema(db);
  const sku=await db.get(`SELECT v.*,p.name AS product_name,p.created_at AS product_created_at FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id WHERE v.id=?`,[variantId]);
  if(!sku)throw bad('SKU not found.',404);
  const end=getNepaliDateString(asOf),start=date(new Date(end).getTime()-180*DAY),location=await getDefaultLocation(db);
  const configRow=await db.get('SELECT * FROM operations_policies WHERE variant_id=?',[variantId]),config=policy(configRow?JSON.parse(configRow.config):{});
  const [demand,movements,opening,firstReceipt,incoming,receipts,returns,claims,discounts,variance,batches,channels]=await Promise.all([
    db.all(`SELECT DATE(s.completed_at) AS day,SUM(l.quantity) AS units,MAX(CASE WHEN l.discount_amount>0 OR s.discount_amount>0 THEN 1 ELSE 0 END) AS promotion FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id WHERE l.variant_id=? AND s.status='COMPLETED' AND s.completed_at>=? AND s.completed_at<? GROUP BY DATE(s.completed_at) ORDER BY day`,[variantId,start,end]),
    db.all(`SELECT DATE(m.created_at) AS day,SUM(m.quantity) AS quantity FROM inventory_movements m JOIN inventory_locations loc ON loc.id=m.location_id WHERE m.variant_id=? AND loc.is_sellable=1 AND m.created_at>=? AND m.created_at<? GROUP BY DATE(m.created_at) ORDER BY day`,[variantId,start,end]),
    db.get(`SELECT COALESCE(SUM(m.quantity),0) AS quantity FROM inventory_movements m JOIN inventory_locations loc ON loc.id=m.location_id WHERE m.variant_id=? AND loc.is_sellable=1 AND m.created_at<?`,[variantId,start]),
    db.get('SELECT MIN(created_at) AS first_at FROM inventory_movements WHERE variant_id=? AND quantity>0',[variantId]),
    db.get(`SELECT COALESCE(SUM((l.ordered_quantity-l.quantity_received)*l.conversion_factor),0) AS quantity FROM purchase_order_lines l JOIN purchase_orders p ON p.id=l.purchase_order_id WHERE l.variant_id=? AND p.location_id=? AND p.status IN ('APPROVED','PARTIALLY_RECEIVED') AND l.ordered_quantity>l.quantity_received`,[variantId,location.id]),
    db.all(`SELECT l.id,l.unit_cost,l.quantity_received,r.id AS grn_id,r.grn_number,r.posted_at,r.supplier_id,s.name AS supplier_name,p.approved_at FROM goods_receipt_lines l JOIN goods_receipts r ON r.id=l.goods_receipt_id LEFT JOIN suppliers s ON s.id=r.supplier_id LEFT JOIN purchase_orders p ON p.id=r.purchase_order_id WHERE l.variant_id=? AND r.status='POSTED' ORDER BY r.posted_at DESC,l.id DESC LIMIT 20`,[variantId]),
    db.all(`SELECT r.id,r.return_number,r.posted_at,l.quantity,l.refund_amount FROM retail_return_lines l JOIN retail_returns r ON r.id=l.retail_return_id WHERE l.variant_id=? AND r.status='POSTED' AND r.posted_at>=? AND r.posted_at<? ORDER BY r.id DESC LIMIT 500`,[variantId,start,end]),
    db.all(`SELECT id,claim_number,issue,status,resolution,created_at,resolved_at FROM warranty_claims WHERE variant_id=? AND created_at>=? AND created_at<? ORDER BY id DESC LIMIT 500`,[variantId,start,end]),
    db.get(`SELECT COUNT(*) AS count,COALESCE(SUM(l.discount_amount),0) AS amount,COALESCE(SUM(l.quantity*l.unit_price),0) AS gross FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id WHERE l.variant_id=? AND s.status='COMPLETED' AND s.completed_at>=? AND s.completed_at<?`,[variantId,start,end]),
    db.all(`SELECT id,movement_type,quantity,total_cost,created_at,reference_type,reference_id FROM inventory_movements WHERE variant_id=? AND movement_type IN ('SHRINKAGE','LOSS','STOCK_ADJUSTMENT_OUT') AND created_at>=? ORDER BY id DESC LIMIT 50`,[variantId,start]),
    db.all(`SELECT b.id,b.batch_number,b.expiry_date,SUM(i.quantity_on_hand) AS quantity FROM inventory_batches b JOIN inventory_balances i ON i.batch_id=b.id WHERE b.variant_id=? AND b.expiry_date IS NOT NULL GROUP BY b.id,b.batch_number,b.expiry_date HAVING SUM(i.quantity_on_hand)>0 ORDER BY b.expiry_date LIMIT 50`,[variantId]),
    db.all(`SELECT s.channel,SUM(CASE WHEN s.completed_at>=? THEN l.quantity ELSE 0 END) AS recent_units,SUM(CASE WHEN s.completed_at>=? AND s.completed_at<? THEN l.quantity ELSE 0 END) AS prior_units,SUM(l.quantity) AS units,SUM(l.net_amount) AS line_revenue,SUM(l.total_cost) AS cogs,COUNT(DISTINCT s.id) AS transactions FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id WHERE l.variant_id=? AND s.status='COMPLETED' AND s.completed_at>=? AND s.completed_at<? GROUP BY s.channel`,[date(new Date(end).getTime()-7*DAY),date(new Date(end).getTime()-35*DAY),date(new Date(end).getTime()-7*DAY),variantId,start,end]),
  ]);
  const demandByDay=new Map(demand.map(d=>[date(d.day),d])),movementByDay=new Map(movements.map(d=>[date(d.day),number(d.quantity)]));
  const first=firstReceipt.first_at?getNepaliDateString(firstReceipt.first_at):end;
  let balance=number(opening.quantity);const history=[];
  for(let time=new Date(start).getTime();time<new Date(end).getTime();time+=DAY){const day=date(time);balance+=movementByDay.get(day)||0;if(day<first)continue;const observed=demandByDay.get(day);history.push({date:day,units:number(observed?.units),stockout:balance<=0&&number(observed?.units)===0,promotion:!!number(observed?.promotion)});}
  const forecast=forecastDemand(history,{horizon:Number(horizon)}),available=await getAvailableToSell(db,variantId,location.id),sellable=await getSellableStock(db,variantId,{locationId:location.id});
  const leadSamples=receipts.filter(r=>r.approved_at&&new Date(r.posted_at)>=new Date(r.approved_at)).map(r=>(new Date(r.posted_at)-new Date(r.approved_at))/DAY).sort((a,b)=>a-b);
  const leadMedian=leadSamples.length?(leadSamples[Math.floor((leadSamples.length-1)/2)]+leadSamples[Math.floor(leadSamples.length/2)])/2:null;
  const recommendation=replenishment(forecast,{...config,available,incoming:number(incoming.quantity),leadDays:config.leadDays||Math.ceil(leadMedian||0),reorderPoint:number(sku.reorder_point),reorderQuantity:number(sku.reorder_quantity)});
  const qualityTotals=await db.get(`SELECT (SELECT COUNT(*) FROM warranty_claims WHERE variant_id=? AND created_at>=? AND created_at<?) AS claims,(SELECT COALESCE(SUM(l.quantity),0) FROM retail_return_lines l JOIN retail_returns r ON r.id=l.retail_return_id WHERE l.variant_id=? AND r.status='POSTED' AND r.posted_at>=? AND r.posted_at<?) AS returned_units,(SELECT COALESCE(SUM(e.carrying_value),0) FROM warranty_economics e JOIN warranty_claims c ON c.id=e.claim_id WHERE c.variant_id=? AND e.created_at>=? AND e.created_at<?) AS warranty_cost`,[variantId,start,end,variantId,start,end,variantId,start,end]);
  const units=demand.reduce((sum,d)=>sum+number(d.units),0),returnUnits=number(qualityTotals.returned_units);
  const signals=[],latest=receipts[0],previous=receipts[1],price=number(sku.price),cost=latest?number(latest.unit_cost):null,oldCost=previous?number(previous.unit_cost):null;
  if(recommendation.suggested>0)signals.push({type:'REPLENISHMENT',reason:recommendation.reason,href:'/admin/retail-replenishment'});
  if(cost!==null&&oldCost>0&&(cost-oldCost)/oldCost>=config.costIncrease)signals.push({type:'COST_INCREASE',previous:oldCost,current:cost,change:(cost-oldCost)/oldCost,receipts:[previous.grn_id,latest.grn_id],href:'/admin/retail-goods-receipts'});
  if(price>0&&oldCost!==null&&cost!==null&&(cost-oldCost)/price>=config.marginDrop)signals.push({type:'MARGIN_PRESSURE',previous_cost:oldCost,current_cost:cost,current_price:price,previous_cost_at_current_price_margin:(price-oldCost)/price,current_margin:(price-cost)/price,reason:'Cost comparison at the current SKU price; historical selling prices may differ.',href:'/admin/products/pricing'});
  const recentUnits=history.slice(-config.slowDays).reduce((s,d)=>s+d.units,0),age=(new Date(end)-new Date(first))/DAY,lastSale=demand.length?date(demand.at(-1).day):null,daysSince=lastSale?(new Date(end)-new Date(lastSale))/DAY:null;
  if(available>0&&age>=config.deadDays&&(daysSince===null||daysSince>=config.deadDays))signals.push({type:'DEAD_STOCK_RULE',age,days_since_sale:daysSince,threshold_days:config.deadDays,available,href:'/admin/retail-inventory'});
  else if(available>0&&age>=config.slowDays&&recentUnits<config.slowUnits)signals.push({type:'SLOW_MOVING',units:recentUnits,period_days:config.slowDays,threshold_units:config.slowUnits,available,href:'/admin/retail-sales-history'});
  if(forecast.daily>0&&available>forecast.daily*config.coverDays+recommendation.safety)signals.push({type:'OVERSTOCK',excess:Math.floor(available-forecast.daily*config.coverDays-recommendation.safety),cover_days:recommendation.days_cover,target_days:config.coverDays,href:'/admin/retail-inventory'});
  if(units>=config.minSample&&returnUnits/units>=config.returnRate)signals.push({type:'RETURN_ACTIVITY',returned_units:returnUnits,sold_units:units,rate:returnUnits/units,threshold:config.returnRate,href:'/admin/retail-returns'});
  if(variance.length>=3)signals.push({type:'REPEATED_INVENTORY_LOSS',count:variance.length,period_days:180,href:'/admin/retail-inventory-movements'});
  if(number(discounts.gross)>0&&units>=config.minSample&&number(discounts.amount)/number(discounts.gross)>=config.discountRate)signals.push({type:'LINE_DISCOUNT_ACTIVITY',discount_amount:number(discounts.amount),gross_line_value:number(discounts.gross),rate:number(discounts.amount)/number(discounts.gross),threshold:config.discountRate,reason:'Line discounts only; bill-level discounts are excluded from this metric.',href:'/admin/retail-sales-history'});
  const issues={};for(const c of claims)issues[c.issue]=(issues[c.issue]||0)+1;
  let priorBatch=0;const expiry=batches.map(b=>{const days=Math.max(0,(new Date(b.expiry_date)-new Date(end))/DAY),quantity=number(b.quantity),expected=forecast.daily===null?null:Math.max(0,forecast.daily*days-priorBatch);priorBatch+=quantity;return {...b,quantity,days_to_expiry:days,expected_sell_through:expected===null?null:Math.min(quantity,expected),risk:expected===null?'Insufficient history':expected<quantity?'At risk':'Likely safe'};});
  const result={variant_id:Number(variantId),sku:sku.sku,product_name:sku.product_name,period:{from:start,to_exclusive:end,time_basis:'Asia/Kathmandu complete calendar days'},config,policy_version:configRow?.version||0,forecast,recommendation,available,sellable,incoming:number(incoming.quantity),history,
    stockout_policy:'Closing sellable-location quantity is reconstructed from canonical movements. Zero-sale days with no closing stock are censored. Intraday outages, historical reservations and historical expiry are not reconstructed.',
    demand_policy:'Gross units from COMPLETED Retail Sales. Returns shown separately; pending orders are excluded. Discounted days flag possible promotion effects.',
    supplier:{preferred_id:latest?.supplier_id||null,name:latest?.supplier_name||null,lead_sample_count:leadSamples.length,median_lead_days:leadMedian,mean_lead_days:leadSamples.length?leadSamples.reduce((a,b)=>a+b,0)/leadSamples.length:null},
    receipts,returns,claims,quality:{sold_units:units,claim_count:number(qualityTotals.claims),claim_rate:units?number(qualityTotals.claims)/units:null,returned_units:returnUnits,return_rate:units?returnUnits/units:null,warranty_cost:number(qualityTotals.warranty_cost),minimum_sample:config.minSample,sufficient_sample:units>=config.minSample,issues},discounts,variance,expiry,channels,signals,
    evidence_limits:{receipts:20,returns:500,claims:500,variance:50,batches:50}};
  result.supplier.fulfillment=await db.all(`SELECT p.supplier_id,s.name AS supplier_name,COUNT(DISTINCT p.id) AS orders,SUM(l.ordered_quantity*l.conversion_factor) AS ordered_units,SUM(l.quantity_received*l.conversion_factor) AS received_units,SUM(CASE WHEN l.quantity_received>0 AND l.quantity_received<l.ordered_quantity THEN 1 ELSE 0 END) AS partial_lines FROM purchase_order_lines l JOIN purchase_orders p ON p.id=l.purchase_order_id JOIN suppliers s ON s.id=p.supplier_id WHERE l.variant_id=? AND p.status IN ('APPROVED','PARTIALLY_RECEIVED','RECEIVED') GROUP BY p.supplier_id,s.name ORDER BY p.supplier_id LIMIT 50`,[variantId]);
  result.supplier.purchase_returns=await db.all(`SELECT r.supplier_id,COUNT(DISTINCT r.id) AS documents,SUM(l.quantity) AS units,SUM(l.net_amount) AS credit FROM purchase_return_lines l JOIN purchase_returns r ON r.id=l.purchase_return_id WHERE l.variant_id=? AND r.status='POSTED' GROUP BY r.supplier_id ORDER BY r.supplier_id LIMIT 50`,[variantId]);
  result.cost_summary={latest:cost,previous:oldCost,weighted_recent_cost:receipts.length?receipts.reduce((sum,r)=>sum+number(r.unit_cost)*number(r.quantity_received),0)/(receipts.reduce((sum,r)=>sum+number(r.quantity_received),0)||1):null,receipt_limit:20};
  if(history.length>=35){const recent=history.slice(-7),prior=history.slice(-35,-7),baseline=prior.reduce((sum,d)=>sum+d.units,0)/4,observed=recent.reduce((sum,d)=>sum+d.units,0);if(baseline>=config.minSample&&Math.abs(observed-baseline)/baseline>=config.salesChange&&!recent.some(d=>d.stockout||d.promotion))signals.push({type:observed>baseline?'SALES_SPIKE':'SALES_DROP',recent_week_units:observed,previous_weekly_average:baseline,relative_change:(observed-baseline)/baseline,threshold:config.salesChange,reason:'Latest complete week versus the preceding four weeks. Known stockout and promotion weeks are suppressed; unrecorded closures may explain changes.',href:'/admin/retail-sales-history'});}
  signals.push(...channelShiftSignals(channels,{minimum:config.minSample,threshold:config.channelShift,confounded:history.length<35||history.slice(-7).some(d=>d.stockout||d.promotion)}));
  const hash=fingerprint(result);
  await db.run('INSERT INTO operations_snapshots(variant_id,horizon,fingerprint,evidence) VALUES (?,?,?,?) ON CONFLICT(fingerprint) DO NOTHING',[variantId,horizon,hash,JSON.stringify(result)]);
  const saved=await db.get('SELECT id,generated_at FROM operations_snapshots WHERE fingerprint=?',[hash]);
  return {...result,snapshot_id:saved.id,generated_at:saved.generated_at};
}
export async function operationsDecision(db,input,actorId){
  const hash=fingerprint(input),requestKey=String(input.idempotency_key||'');
  if(requestKey.length<8||requestKey.length>120)throw bad('A retry key is required.');
  if(!['DRAFT_PO','IGNORE'].includes(input.action))throw bad('Choose draft PO or ignore.');
  if(!String(input.reason||'').trim())throw bad('Record the decision reason.');
  return db.transaction(async tx=>{
    const snapshot=await tx.get(`SELECT * FROM operations_snapshots WHERE id=?${tx.driver==='postgres'?' FOR UPDATE':''}`,[input.snapshot_id]);if(!snapshot)throw bad('Recommendation not found.',404);
    const replay=await tx.get('SELECT * FROM operations_decisions WHERE request_key=?',[requestKey]);if(replay){if(replay.request_hash!==hash)throw bad('Retry key conflict.',409);return replay;}
    const data=JSON.parse(snapshot.evidence),quantity=Number(input.quantity),supplier=Number(input.supplier_id);let po=null;
    if(input.action==='DRAFT_PO'){
      if(!(quantity>0&&quantity<=100000)||!Number.isFinite(quantity)||!Number.isFinite(Number(input.unit_cost))||Number(input.unit_cost)<0)throw bad('Enter a positive quantity and known unit cost.');
      if(!await tx.get('SELECT id FROM suppliers WHERE id=?',[supplier]))throw bad('Supplier not found.',404);
      po=await createPurchaseOrder({...tx,transaction:fn=>fn(tx)},{supplierId:supplier,createdBy:actorId,notes:`Operations snapshot ${snapshot.id}: ${String(input.reason).slice(0,1000)}`,lines:[{variantId:snapshot.variant_id,orderedQuantity:quantity,unitCost:Number(input.unit_cost)}]});
    }
    const id=(await tx.run(`INSERT INTO operations_decisions(snapshot_id,action,suggested_quantity,final_quantity,supplier_id,reason,actor_id,po_id,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`,[snapshot.id,input.action,data.recommendation.suggested,po?quantity:null,po?supplier:null,String(input.reason).slice(0,1000),actorId,po?.id||null,requestKey,hash])).lastInsertRowid;
    return tx.get('SELECT * FROM operations_decisions WHERE id=?',[id]);
  });
}
export async function forecastActual(db,snapshotId){
  const row=await db.get('SELECT * FROM operations_snapshots WHERE id=?',[snapshotId]);if(!row)throw bad('Forecast not found.',404);
  const evidence=JSON.parse(row.evidence),from=evidence.period.to_exclusive,to=date(new Date(from).getTime()+row.horizon*DAY);
  if(to>getNepaliDateString())return {status:'Validation period incomplete',from,to};
  const actual=await db.get(`SELECT COALESCE(SUM(l.quantity),0) AS units FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id WHERE l.variant_id=? AND s.status='COMPLETED' AND s.completed_at>=? AND s.completed_at<?`,[row.variant_id,from,to]);
  const expected=evidence.forecast.expected;return {from,to,forecast:expected,actual:number(actual.units),error:expected===null?null:expected-number(actual.units),absolute_error:expected===null?null:Math.abs(expected-number(actual.units))};
}
