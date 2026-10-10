import { warrantyError as bad } from '@/lib/retail-warranty-rules.js';
import { issueStock,receiveStock,getQuarantineLocation } from '@/lib/retail-inventory.js';
import { registerSerialsOnReceipt } from '@/lib/retail-serials.js';
import { createPurchaseReturn,postPurchaseReturn } from '@/lib/retail-purchasing.js';
import { lockRetailStock } from '@/lib/retail-stock-lock.js';
const lock=tx=>tx.driver==='postgres'?' FOR UPDATE':'';
const nested=tx=>({...tx,transaction:fn=>fn(tx)});
// Caller owns sale + claim locks. Transfers preserve value and never credit AP.
async function move(tx,c,from,to,ref,id,actorId){
  const mode=await tx.get('SELECT tracking_mode FROM menu_item_variants WHERE id=?',[c.variant_id]);
  if(mode.tracking_mode==='batch'&&!c.batch_id)throw bad('Original batch identity is required.',409);
  for(const location of [from,to].sort((a,b)=>a-b))await lockRetailStock(tx,[c.variant_id],location);
  if(c.serial_number){const serial=await tx.get(`SELECT * FROM inventory_serials WHERE serial_number=?${lock(tx)}`,[c.serial_number]);if(serial.status!=='QUARANTINE'||Number(serial.location_id)!==Number(from))throw bad('RMA serial is no longer in the recorded custody.',409);}
  const opts={variantId:c.variant_id,batchId:c.batch_id,quantity:Number(c.quantity),referenceType:ref,referenceId:id,createdBy:actorId,reason:c.claim_number};
  await issueStock(tx,{...opts,locationId:from,movementType:'TRANSFER_OUT'});
  await receiveStock(tx,{...opts,locationId:to,movementType:'TRANSFER_IN'});
  if(c.serial_number)await tx.run('UPDATE inventory_serials SET location_id=? WHERE serial_number=?',[to,c.serial_number]);
}
export async function dispatchOwnedRma(tx,c,rmaId,actorId){
  const source=await getQuarantineLocation(tx),destination=await tx.get("SELECT id FROM inventory_locations WHERE code='SUPPLIER_RMA'");
  if(!destination)throw bad('Supplier RMA location has not been migrated.',409);
  await move(tx,c,source.id,destination.id,'warranty_rma_dispatch',rmaId,actorId);
  await tx.run("UPDATE warranty_rmas SET ownership='RETAILER',source_location_id=?,rma_location_id=? WHERE id=?",[source.id,destination.id,rmaId]);
  await tx.run("UPDATE warranty_claims SET custody='RETAILER_SUPPLIER' WHERE id=?",[c.id]);
}
export async function resolveOwnedRma(tx,c,rma,input,actorId){
  if(!['REPAIRED','REJECTED','NO_FAULT_FOUND','REPLACED','CREDIT'].includes(input.outcome))throw bad('Invalid supplier outcome.');
  if(input.outcome==='REPLACED'){
    if(!c.serial_number){
      await lockRetailStock(tx,[c.variant_id],rma.rma_location_id);
      const out=await issueStock(tx,{variantId:c.variant_id,batchId:c.batch_id,locationId:rma.rma_location_id,quantity:Number(c.quantity),movementType:'PURCHASE_RETURN',referenceType:'warranty_supplier_replace',referenceId:rma.id,createdBy:actorId});
      const value=out.reduce((total,row)=>total+Number(row.movement.total_cost),0);
      await receiveStock(tx,{variantId:c.variant_id,locationId:rma.source_location_id,quantity:Number(c.quantity),batchNumber:input.replacement_batch||null,totalValue:value,unitCost:value/Number(c.quantity),movementType:'PURCHASE_RECEIPT',referenceType:'warranty_supplier_replace',referenceId:rma.id,createdBy:actorId});
    }else{
    if(!String(input.replacement_serial||'').trim())throw bad('Supplier replacement requires an exact old and new serial.');
    const original=await tx.get(`SELECT * FROM inventory_serials WHERE serial_number=?${lock(tx)}`,[c.serial_number]);
    if(original.status!=='QUARANTINE'||Number(original.location_id)!==Number(rma.rma_location_id))throw bad('RMA serial is unavailable.',409);
    await lockRetailStock(tx,[c.variant_id],rma.rma_location_id);
    const [out]=await issueStock(tx,{variantId:c.variant_id,locationId:rma.rma_location_id,quantity:1,movementType:'PURCHASE_RETURN',referenceType:'warranty_supplier_replace',referenceId:rma.id,createdBy:actorId});
    await registerSerialsOnReceipt(tx,{variantId:c.variant_id,locationId:rma.source_location_id,serialNumbers:[String(input.replacement_serial).trim()],totalValue:Number(out.movement.total_cost),unitCost:Number(out.movement.total_cost),supplierId:rma.supplier_id,referenceType:'warranty_supplier_replace',referenceId:rma.id,createdBy:actorId});
    await tx.run("UPDATE inventory_serials SET status='RETURNED_TO_SUPPLIER' WHERE id=?",[original.id]);
    await tx.run("UPDATE inventory_serials SET status='QUARANTINE' WHERE serial_number=?",[String(input.replacement_serial).trim()]);
    await tx.run('UPDATE warranty_rmas SET replacement_serial=? WHERE id=?',[String(input.replacement_serial).trim(),rma.id]);
    }
  }else if(input.outcome==='CREDIT'){
    if(!rma.grn_id||!input.grn_line_id||!Number.isFinite(Number(input.credit_unit_cost))||Number(input.credit_unit_cost)<0)throw bad('Supplier credit needs original GRN line and actual granted unit credit.');
    const grn=await tx.get('SELECT location_id FROM goods_receipts WHERE id=?',[rma.grn_id]);
    // Canonical purchase returns require the original receipt location. The
    // transfer and return are in this same transaction, so no sellable interval escapes.
    await move(tx,c,rma.rma_location_id,grn.location_id,'warranty_rma_credit',rma.id,actorId);
    if(c.serial_number)await tx.run("UPDATE inventory_serials SET status='IN_STOCK' WHERE serial_number=?",[c.serial_number]);
    const ret=await createPurchaseReturn(nested(tx),{supplierId:rma.supplier_id,goodsReceiptId:rma.grn_id,reason:`Supplier credit for ${rma.rma_number}: ${input.note}`,createdBy:actorId,lines:[{variant_id:c.variant_id,batch_id:c.batch_id,goods_receipt_line_id:Number(input.grn_line_id),quantity:Number(c.quantity),unit_cost:Number(input.credit_unit_cost),serial_numbers:c.serial_number?[c.serial_number]:[]}]});
    await postPurchaseReturn(nested(tx),ret.id,{postedBy:actorId});
    await tx.run('UPDATE warranty_rmas SET purchase_return_id=? WHERE id=?',[ret.id,rma.id]);
  }else await move(tx,c,rma.rma_location_id,rma.source_location_id,'warranty_rma_receive',rma.id,actorId);
  await tx.run('UPDATE warranty_claims SET custody=? WHERE id=?',[input.outcome==='CREDIT'?'SUPPLIER_ACCEPTED':'RETAILER_QUARANTINE',c.id]);
}
