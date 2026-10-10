'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';
export default function WarrantyPurchases({customerId}){
  const {can}=useCapabilities(),[rows,setRows]=useState([]),[error,setError]=useState('');const allowed=can('warranty.view');
  useEffect(()=>{if(allowed)apiJson('/api/admin/retail-after-sales?view=purchases&customer_id='+customerId).then(r=>setRows(r.data)).catch(e=>setError(e.message));},[customerId,allowed]);
  if(!allowed)return null;
  return <section className="retail-money-card"><h2>Purchased products & warranty</h2>{error&&<p role="alert">{error}</p>}<div className="retail-money-table-wrap"><table className="retail-money-table"><thead><tr><th>Product</th><th>Purchase</th><th>Serial / quantity</th><th>Coverage expiry</th><th>Service</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.snapshot_id||i}><td>{r.product_name}</td><td>{r.sale_number}</td><td>{r.serial_number||r.quantity+' units'}</td><td>{r.expires_at?String(r.expires_at).slice(0,10):'Coverage review'}</td><td><Link href={'/admin/retail-after-sales?purchase='+encodeURIComponent(r.serial_number||r.sale_number)}>View / request service</Link></td></tr>)}</tbody></table></div></section>;
}
