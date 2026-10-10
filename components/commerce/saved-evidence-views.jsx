'use client';
import { useEffect,useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

const allowed=new Set(['q','type','entity','action','product','serial','batch','from','to','status','actor_id','customer_id','supplier_id','business_day_id','payment_method','min_amount','max_amount']);
/** Browser-local, per-user preferences. Results and credentials are never stored. */
export default function SavedEvidenceViews({scope,filters,onSelect}) {
  const {user}=useAuth();
  const [views,setViews]=useState([]),[name,setName]=useState(''),[error,setError]=useState('');
  const key=user?.id?`aadhar:views:${user.id}:${scope}`:null;
  useEffect(()=>{
    if(!key)return;
    const frame=requestAnimationFrame(()=>{
      try{const value=JSON.parse(localStorage.getItem(key)||'[]');setViews(Array.isArray(value)?value.filter(v=>v&&typeof v.name==='string'&&v.filters&&typeof v.filters==='object').slice(0,20):[]);}catch{setViews([]);}
    });
    return()=>cancelAnimationFrame(frame);
  },[key]);
  function persist(next){try{localStorage.setItem(key,JSON.stringify(next));setViews(next);setError('');}catch{setError('This browser could not save your view.');}}
  function save(){
    const clean=name.trim().slice(0,60);if(!clean||!key)return;
    const view={name:clean,filters:Object.fromEntries(Object.entries(filters||{}).filter(([k,v])=>allowed.has(k)&&typeof v==='string').map(([k,v])=>[k,v.slice(0,120)]))};
    persist([...views.filter(v=>v.name!==clean),view].slice(-20));setName('');
  }
  const control='h-9 rounded-xl border border-gray-300 bg-white px-3 text-sm';
  return <div className="my-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white/60 px-4 py-2.5" title="Saved on this browser only">
    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Saved views</span>
    {views.length>0&&<select className={control} aria-label="Open a saved view" value="" onChange={e=>{const view=views.find(v=>v.name===e.target.value);if(view)onSelect(view.filters);}}><option value="">Open a view…</option>{views.map(v=><option key={v.name}>{v.name}</option>)}</select>}
    <input className={`${control} min-w-0 flex-1 sm:max-w-xs`} aria-label="Name for the current filters" placeholder="Name these filters, e.g. Today's cash sales" value={name} maxLength={60} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();save();}}}/>
    <Button variant="outline" size="sm" disabled={!name.trim()||!key} onClick={save}>Save</Button>
    {views.length>0&&<details className="relative text-sm"><summary className="cursor-pointer font-semibold text-gray-600">Manage</summary><div className="absolute right-0 z-10 mt-1 min-w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">{views.map(v=><div className="flex items-center justify-between gap-2 px-2 py-1" key={v.name}><span className="truncate">{v.name}</span><Button variant="ghost" size="sm" onClick={()=>persist(views.filter(x=>x.name!==v.name))} aria-label={`Delete view ${v.name}`}>Delete</Button></div>)}</div></details>}
    {error&&<p role="alert" className="basis-full text-xs text-red-700">{error}</p>}
  </div>;
}
