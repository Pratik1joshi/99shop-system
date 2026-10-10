/** Must run inside the caller's transaction before any catalog reads/writes. */
export async function lockCatalogWrite(db){
  if(db.driver==='postgres')await db.run('LOCK TABLE menu_items,menu_item_variants,product_barcodes IN SHARE ROW EXCLUSIVE MODE');
}
