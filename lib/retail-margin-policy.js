import { allocateValue } from '@/lib/inventory-money.js';
import { auditPriceChange } from '@/lib/retail-price-management.js';
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
export async function saveMarginPolicy(db,input,actorId){
  const minimum=Number(input.minimum_percent);
  if(!['off','warn','manager'].includes(input.mode)||!Number.isFinite(minimum)||minimum<0||minimum>100)throw bad('Choose a valid margin policy');
  return db.transaction(async tx=>{
    const before=await tx.get('SELECT * FROM retail_margin_policy WHERE id=1');
    await tx.run('UPDATE retail_margin_policy SET mode=?,minimum_percent=? WHERE id=1',[input.mode,minimum]);
    await auditPriceChange(tx,actorId,'MARGIN_POLICY',1,before,{mode:input.mode,minimum_percent:minimum},input.reason);
    return {mode:input.mode,minimum_percent:minimum};
  });
}
/** Evaluate final pre-tax revenue after promotions, manual discounts and loyalty. */
export async function checkRetailMargins(db,lines,{discount=0,managerAuthorized=false,enforce=false}={}){
  const policy=await db.get('SELECT * FROM retail_margin_policy WHERE id=1');
  if(!policy||policy.mode==='off')return [];
  const ids=[...new Set(lines.map(line=>line.variant_id))];
  const costs=await db.all(`SELECT variant_id,quantity_on_hand,carrying_value FROM inventory_costs WHERE variant_id IN (${ids.map(()=>'?').join(',')})`,ids);
  const net=lines.map(line=>Math.max(0,Number(line.net_amount))),total=net.reduce((a,b)=>a+b,0);
  const shares=total>0?allocateValue(Math.min(total,Math.max(0,Number(discount))),net):net.map(()=>0);
  const warnings=[];
  lines.forEach((line,index)=>{
    const cost=costs.find(row=>Number(row.variant_id)===Number(line.variant_id));
    if(!cost||Number(cost.quantity_on_hand)<=0)return;
    const value=Number(cost.carrying_value)/Number(cost.quantity_on_hand)*Number(line.quantity),revenue=net[index]-shares[index];
    if(value>revenue*(1-Number(policy.minimum_percent)/100)+0.000001)warnings.push({variant_id:line.variant_id,message:policy.mode==='manager'?'Manager price authorization required by margin policy':'Below configured margin target',requires_manager:policy.mode==='manager'&&!managerAuthorized});
  });
  if(enforce&&warnings.some(warning=>warning.requires_manager))throw bad('Manager price authorization required by margin policy',403);
  return warnings;
}
