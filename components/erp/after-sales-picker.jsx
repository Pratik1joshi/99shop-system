'use client';
import {useEffect,useState} from 'react';
import {apiJson} from '@/lib/authed-fetch';
export default function AfterSalesPicker({name='variant_id',label='Find SKU',kind='skus'}){
  const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[selected,setSelected]=useState(null);
  useEffect(()=>{if(!query.trim()||selected)return;let active=true;const timer=setTimeout(()=>apiJson('/api/admin/retail-after-sales?view='+kind+'&q='+encodeURIComponent(query)).then(r=>{if(active)setRows(r.data);}).catch(()=>{if(active)setRows([]);}),160);return()=>{active=false;clearTimeout(timer);};},[query,selected,kind]);
  return <div className="relative"><label className="grid gap-1 text-sm">{label}<input aria-label={label} className="min-h-11 w-full rounded-md border border-slate-300 px-3 py-2" value={query} placeholder={kind==='skus'?'Scan barcode or search product / SKU':'Search supplier'} onChange={e=>{setQuery(e.target.value);setSelected(null);}} required/></label><input type="hidden" name={name} value={selected?.id||''}/>{query&&!selected&&<ul className="relative z-10 max-h-56 overflow-y-auto rounded border bg-white shadow-sm">{rows.map(r=><li key={r.id}><button type="button" className="min-h-11 w-full p-2 text-left text-sm hover:bg-slate-50" onClick={()=>{setSelected(r);setQuery(r.name+(r.sku?' · '+r.sku:''));setRows([]);}}>{r.name} {r.sku?' · '+r.sku:''}</button></li>)}{!rows.length&&<li className="p-2 text-sm text-slate-500">No matching records</li>}</ul>}</div>;
}
