const bad = message => Object.assign(new Error(message), { status: 400 });
const text = (value, label) => {
  const result = String(value ?? '').trim();
  if (!result || result.length > 160) throw bad(`${label} is required (maximum 160 characters)`);
  return result;
};
const number = (value, label, min = 0, max = 999999999) => {
  if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) throw bad(`Invalid ${label}`);
  return Number(value);
};
export async function auditPriceChange(db, actorId, action, sourceId, before, after, reason) {
  await db.run(`INSERT INTO retail_price_audit(actor_id,action,source_id,before_json,after_json,reason) VALUES (?,?,?,?,?,?)`,
    [actorId,action,sourceId,JSON.stringify(before),JSON.stringify(after),text(reason,'Change reason')]);
}

/** All edits are atomic and retain before/after evidence. No inventory costs are changed. */
export async function savePriceList(db, input, actorId) {
  const name=text(input.name,'Name'),code=text(input.code,'Code');
  const channel=input.channel || null;
  if(channel && !['retail_pos','online'].includes(channel)) throw bad('Unsupported channel');
  const priority=number(input.priority ?? 0,'priority',-10000,10000);
  if(!Number.isInteger(priority)) throw bad('Priority must be an integer');
  const date=value=>{ if(!value) return null;const d=new Date(value);if(!Number.isFinite(d.getTime()))throw bad('Invalid schedule');return d.toISOString(); };
  const start=date(input.starts_at),end=date(input.ends_at);
  if(start&&end&&end<=start) throw bad('End must follow start');
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>1000)throw bad('Provide between 1 and 1000 price rules');
  const seen=new Set();
  const items=input.items.map(item=>{
    const variant=item.variant_id ? number(item.variant_id,'SKU',1):null,product=item.product_id ? number(item.product_id,'product',1):null;
    if((variant==null)===(product==null)||![variant,product].filter(v=>v!=null).every(Number.isSafeInteger))throw bad('Each rule needs one product or SKU');
    const quantity=number(item.min_quantity??1,'minimum quantity',0.001);
    const fixed=item.fixed_price==null||item.fixed_price===''?null:number(item.fixed_price,'fixed price');
    const percent=item.adjustment_percent==null||item.adjustment_percent===''?null:number(item.adjustment_percent,'adjustment percent',-100,10000);
    if((fixed==null)===(percent==null))throw bad('Choose fixed price or percentage adjustment');
    const key=`${variant}:${product}:${quantity}`;
    if(seen.has(key))throw bad('Duplicate price tier');seen.add(key);
    return {variant_id:variant,product_id:product,min_quantity:quantity,fixed_price:fixed,adjustment_percent:percent};
  });
  return db.transaction(async tx=>{
    const lock=tx.driver==='postgres'?' FOR UPDATE':'';
    const before=input.id ? await tx.get(`SELECT * FROM retail_price_lists WHERE id=?${lock}`,[input.id]):null;
    if(input.id&&!before)throw bad('Price list not found');
    if(before) before.items=await tx.all('SELECT * FROM retail_price_list_items WHERE price_list_id=? ORDER BY id',[before.id]);
    const group=input.customer_group_id||null;
    if(group&&!await tx.get('SELECT id FROM retail_customer_groups WHERE id=? AND active=1',[group]))throw bad('Choose an active customer group');
    const fields=[name,code,input.active===false||input.active===0?0:1,channel,group,priority,start,end];
    let id=before?.id;
    if(id)await tx.run('UPDATE retail_price_lists SET name=?,code=?,active=?,channel=?,customer_group_id=?,priority=?,starts_at=?,ends_at=? WHERE id=?',[...fields,id]);
    else id=(await tx.run('INSERT INTO retail_price_lists(name,code,active,channel,customer_group_id,priority,starts_at,ends_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)',[...fields,actorId])).lastInsertRowid;
    await tx.run('DELETE FROM retail_price_list_items WHERE price_list_id=?',[id]);
    for(const item of items)await tx.run('INSERT INTO retail_price_list_items(price_list_id,variant_id,product_id,min_quantity,fixed_price,adjustment_percent) VALUES (?,?,?,?,?,?)',[id,item.variant_id,item.product_id,item.min_quantity,item.fixed_price,item.adjustment_percent]);
    await auditPriceChange(tx,actorId,'PRICE_LIST',id,before,{...input,id,items},input.reason);
    return {id};
  });
}

export async function saveCustomerGroup(db,input,actorId) {
  const name=text(input.name,'Group name'),code=text(input.code,'Group code');
  if(!['retail','wholesale'].includes(input.pricing_mode))throw bad('Choose retail or wholesale pricing');
  return db.transaction(async tx=>{
    const before=input.id?await tx.get('SELECT * FROM retail_customer_groups WHERE id=?',[input.id]):null;
    if(input.id&&!before)throw bad('Group not found');
    let id=before?.id;const args=[name,code,input.pricing_mode,input.active===false||input.active===0?0:1];
    if(id)await tx.run('UPDATE retail_customer_groups SET name=?,code=?,pricing_mode=?,active=? WHERE id=?',[...args,id]);
    else id=(await tx.run('INSERT INTO retail_customer_groups(name,code,pricing_mode,active) VALUES (?,?,?,?)',args)).lastInsertRowid;
    await auditPriceChange(tx,actorId,'CUSTOMER_GROUP',id,before,{...input,id},input.reason);return {id};
  });
}

export async function assignCustomerGroup(db,input,actorId) {
  return db.transaction(async tx=>{
    const before=await tx.get('SELECT id,commercial_group_id FROM customers WHERE id=?',[input.customer_id]);
    if(!before)throw bad('Customer not found');
    if(input.group_id&&!await tx.get('SELECT id FROM retail_customer_groups WHERE id=? AND active=1',[input.group_id]))throw bad('Group not found');
    await tx.run('UPDATE customers SET commercial_group_id=? WHERE id=?',[input.group_id||null,before.id]);
    await auditPriceChange(tx,actorId,'CUSTOMER_GROUP_ASSIGNMENT',before.id,before,{group_id:input.group_id||null},input.reason);
    return {id:before.id};
  });
}
