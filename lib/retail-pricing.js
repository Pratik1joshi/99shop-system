import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';
const bad = message => Object.assign(new Error(message), { status: 400 });
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function ensureRetailPricingSchema(db) {
  if (db.driver === 'postgres') return;
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_customer_groups(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,code TEXT UNIQUE,pricing_mode TEXT DEFAULT 'retail',active INTEGER DEFAULT 1)`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_price_lists(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,code TEXT UNIQUE,active INTEGER DEFAULT 1,channel TEXT,customer_group_id INTEGER,priority INTEGER DEFAULT 0,starts_at TEXT,ends_at TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_price_list_items(id INTEGER PRIMARY KEY AUTOINCREMENT,price_list_id INTEGER,product_id INTEGER,variant_id INTEGER,min_quantity NUMERIC DEFAULT 1,fixed_price NUMERIC,adjustment_percent NUMERIC)`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_margin_policy(id INTEGER PRIMARY KEY,mode TEXT DEFAULT 'off',minimum_percent NUMERIC DEFAULT 0)`);
  await ensureColumn(db,'customers','commercial_group_id','INTEGER');
  await ensureColumn(db,'menu_item_variants','wholesale_price','NUMERIC(14,2)');
  await ensureColumn(db,'menu_item_variants','wholesale_min_quantity','NUMERIC DEFAULT 1');
  await ensureColumn(db,'menu_item_variants','merchandising_active','INTEGER DEFAULT 1');
  await ensureColumn(db,'retail_sale_lines','price_explanation_json','TEXT');
}

/** Server-owned price resolution. Returned values never include supplier costs. */
export async function resolveRetailPrices(db, lines, { customerId = null, channel = 'retail_pos', at = new Date() } = {}) {
  await ensureRetailPricingSchema(db);
  if (!['retail_pos','online'].includes(channel)) throw bad('Unsupported sales channel');
  if (!Array.isArray(lines) || !lines.length || lines.length > 200) throw bad('Quote between 1 and 200 lines');
  const timestamp = new Date(at);
  if (!Number.isFinite(timestamp.getTime())) throw bad('Invalid effective date');
  const totals = new Map();
  for (const line of lines) {
    const id = Number(line.variant_id ?? line.variantId), quantity = Number(line.quantity);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(quantity) || quantity <= 0) throw bad('Choose a SKU and positive quantity');
    totals.set(id,(totals.get(id)||0)+quantity);
  }
  const ids = [...totals.keys()], slots = ids.map(()=>'?').join(',');
  const variants = await db.all(`SELECT v.id,v.menu_item_id,v.price,v.wholesale_price,v.wholesale_min_quantity,v.merchandising_active,p.is_available
    FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id WHERE v.id IN (${slots})`,ids);
  if (variants.length !== ids.length || variants.some(v=>!Number(v.is_available)||!Number(v.merchandising_active))) throw bad('A selected product is unavailable');
  const group = customerId ? await db.get(`SELECT g.* FROM customers c JOIN retail_customer_groups g ON g.id=c.commercial_group_id WHERE c.id=? AND g.active=1`,[customerId]) : null;
  const rules = await db.all(`SELECT i.*,l.name AS list_name,l.priority,l.channel,l.customer_group_id,l.starts_at,l.ends_at,l.id AS list_id
    FROM retail_price_list_items i JOIN retail_price_lists l ON l.id=i.price_list_id
    WHERE l.active=1 AND (l.channel IS NULL OR l.channel=?) AND (l.customer_group_id IS NULL OR l.customer_group_id=?)
    AND (i.variant_id IN (${slots}) OR i.product_id IN (SELECT menu_item_id FROM menu_item_variants WHERE id IN (${slots})))`,[channel,group?.id??-1,...ids,...ids]);
  const now=timestamp.getTime();
  return variants.map(v=>{
    const quantity=totals.get(Number(v.id));
    let price=Number(v.price||0),reason='Retail base price';
    if(group?.pricing_mode==='wholesale' && v.wholesale_price!=null && quantity>=Number(v.wholesale_min_quantity||1)) { price=Number(v.wholesale_price);reason='Wholesale customer price'; }
    const matches=rules.filter(rule=>(Number(rule.variant_id)===Number(v.id)||Number(rule.product_id)===Number(v.menu_item_id)) && quantity>=Number(rule.min_quantity)
      && (!rule.starts_at||new Date(rule.starts_at).getTime()<=now)&&(!rule.ends_at||new Date(rule.ends_at).getTime()>now));
    matches.sort((a,b)=>Number(b.priority)-Number(a.priority)||Number(!!b.customer_group_id)-Number(!!a.customer_group_id)||Number(!!b.channel)-Number(!!a.channel)
      ||Number(!!b.variant_id)-Number(!!a.variant_id)||Number(b.min_quantity)-Number(a.min_quantity)||Number(b.list_id)-Number(a.list_id)||Number(b.id)-Number(a.id));
    const selected=matches[0];
    if(selected) { price=selected.fixed_price!=null?Number(selected.fixed_price):r2(price*(1+Number(selected.adjustment_percent)/100));reason=`${selected.list_name}${Number(selected.min_quantity)>1?` · ${Number(selected.min_quantity)}+ quantity tier`:''}`; }
    if(!Number.isFinite(price)||price<0) throw bad('Configured price is invalid');
    return {variant_id:Number(v.id),quantity,unit_price:r2(price),base_price:Number(v.price),reason,price_list_id:selected?.list_id??null,price_rule_id:selected?.id??null,effective_at:timestamp.toISOString()};
  });
}

export async function priceRetailLines(db, lines, context={}) {
  const resolved=await resolveRetailPrices(db,lines,context),byId=new Map(resolved.map(p=>[p.variant_id,p]));
  return lines.map(line=>{
    const resolution=byId.get(Number(line.variant_id??line.variantId)),requested=line.unit_price??line.unitPrice;
    const override=context.allowPriceOverride&&line.price_overridden!==false&&requested!=null&&Number.isFinite(Number(requested))&&Number(requested)>=0;
    const price=override?r2(Number(requested)):resolution.unit_price;
    return {...line,unit_price:price,unitPrice:price,price_resolution:resolution};
  });
}
