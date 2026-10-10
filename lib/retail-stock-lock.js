/** Called only inside a transaction. Sorted locks serialize POS and online demand,
 * including a SKU with no balance rows yet. No separate stock projection. */
export async function lockRetailStock(db, variantIds, locationId) {
  const ids=[...new Set(variantIds.map(Number))].sort((a,b)=>a-b);
  if(db.driver==='postgres')for(const id of ids)await db.get('SELECT pg_advisory_xact_lock(?,?)',[Number(locationId),id]);
}
