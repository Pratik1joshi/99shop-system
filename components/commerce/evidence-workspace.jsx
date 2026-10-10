'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight, Banknote, BookOpen, Boxes, ClipboardCheck, FileText, Gift, HandCoins, Landmark,
  PackageCheck, ReceiptText, RotateCcw, Search, ShoppingCart, SlidersHorizontal, Truck, Undo2, Wallet,
} from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { ActionDrawer,DataTable,EmptyState,WorkspaceHeader,Money } from '@/components/erp/primitives';
import { Button } from '@/components/ui/button';
import { SaleDetail } from '@/components/commerce/sales';
import { apiJson } from '@/lib/authed-fetch';
import { formatNepalDateTime } from '@/lib/report-dates';
import SavedEvidenceViews from '@/components/commerce/saved-evidence-views';

const label = key => String(key||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const when = value => value ? formatNepalDateTime(value)||String(value) : '—';

// One colour and icon per document kind, so a mixed list reads at a glance.
const KIND = {
  sale:{icon:ReceiptText,tone:'success'}, return:{icon:Undo2,tone:'danger'}, exchange:{icon:ArrowLeftRight,tone:'info'},
  collection:{icon:HandCoins,tone:'success'}, store_credit:{icon:Gift,tone:'pink'}, purchase_order:{icon:ShoppingCart,tone:'warning'},
  goods_receipt:{icon:PackageCheck,tone:'info'}, purchase_return:{icon:RotateCcw,tone:'danger'}, adjustment:{icon:SlidersHorizontal,tone:'warning'},
  count:{icon:ClipboardCheck,tone:'info'}, transfer:{icon:Truck,tone:'info'}, expense:{icon:Wallet,tone:'danger'},
  supplier_payment:{icon:Banknote,tone:'warning'}, cash_movement:{icon:Banknote,tone:'pink'}, bank_movement:{icon:Landmark,tone:'info'}, journal:{icon:BookOpen,tone:'pink'},
};
const kindOf = type => KIND[type]||{icon:FileText,tone:'pink'};
function statusTone(status) {
  const s=String(status||'').toUpperCase();
  if(/CANCEL|VOID|REJECT|WRITE/.test(s)) return 'danger';
  if(/HELD|DRAFT|PENDING|PARTIAL|OPEN|DISPATCH/.test(s)) return 'warning';
  if(/COMPLETE|POSTED|APPROVED|PAID|RECEIVED|CLOSED|ACTIVE/.test(s)) return 'success';
  return 'pink';
}
const Chip = ({tone='pink',children}) => <span className={`k-chip k-chip--${tone}`}>{children}</span>;
function KindChip({type,children}) { const k=kindOf(type); return <Chip tone={k.tone}><k.icon aria-hidden/>{children}</Chip>; }

const ADVANCED=['product','serial','batch','status','business_day_id','min_amount','max_amount','payment_method','actor_id'];
const field='h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm';
function Field({filters,name,title,...props}) {
  return <label className="grid gap-1.5 text-sm font-semibold text-gray-700">{title}<input name={name} defaultValue={filters?.[name]||''} className={field} {...props}/></label>;
}

function Snapshot({value}) {
  if(value==null) return <p className="text-sm text-gray-500">Not recorded or not available to your role.</p>;
  if(typeof value!=='object') return <p className="text-sm">{String(value)}</p>;
  return <dl className="k-doc-facts !mt-0 !border-0 !pt-0">{Object.entries(value).map(([key,v])=><div key={key}><dt>{label(key)}</dt><dd>{v&&typeof v==='object'?<Snapshot value={v}/>:v==null||v===''?'Not set':String(v)}</dd></div>)}</dl>;
}

/** Field-by-field before/after, so the change itself is what you see first. */
function ChangeTable({before,after}) {
  if(before==null&&after==null) return <p className="k-note">No before/after snapshot was recorded for this event.</p>;
  if(typeof before!=='object'||typeof after!=='object'||!before||!after) return <div className="grid gap-3 sm:grid-cols-2"><section className="k-card"><h3>Before</h3><div className="k-card-body py-3"><Snapshot value={before}/></div></section><section className="k-card"><h3>After</h3><div className="k-card-body py-3"><Snapshot value={after}/></div></section></div>;
  const keys=[...new Set([...Object.keys(before),...Object.keys(after)])];
  const show=v=>v==null||v===''?<span className="text-gray-400">Not set</span>:typeof v==='object'?JSON.stringify(v):String(v);
  return <section className="k-card"><h3>What changed <span>{keys.filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])).length} field(s)</span></h3>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="px-4 py-2">Field</th><th className="px-4 py-2">Before</th><th className="px-4 py-2">After</th></tr></thead>
      <tbody>{keys.map(k=>{const changed=JSON.stringify(before[k])!==JSON.stringify(after[k]);return <tr key={k} className={`border-t border-gray-100 ${changed?'bg-amber-50/60':''}`}><td className="px-4 py-2 font-semibold text-gray-700">{label(k)}</td><td className={`px-4 py-2 break-words ${changed?'text-gray-500 line-through decoration-gray-300':''}`}>{show(before[k])}</td><td className={`px-4 py-2 break-words ${changed?'font-semibold text-gray-900':''}`}>{show(after[k])}</td></tr>;})}</tbody></table></div>
  </section>;
}

function DocumentView({doc}) {
  const cashier=(usePathname()||'').startsWith('/cashier');
  const customerHref=id=>cashier?`/cashier/customers/${id}`:`/admin/retail-customers/${id}`;
  const facts=[
    ['Recorded',when(doc.occurred_at)],
    ['Recorded by',doc.actor||(doc.actor_id?`User #${doc.actor_id}`:'—')],
    doc.customer_name&&['Customer',<>{doc.customer_id?<Link className="text-pink-700 hover:underline" href={customerHref(doc.customer_id)}>{doc.customer_name}</Link>:doc.customer_name}{doc.customer_phone&&<small>{doc.customer_phone}</small>}</>],
    doc.supplier_name&&['Supplier',doc.supplier_id&&!cashier?<Link className="text-pink-700 hover:underline" href={`/admin/retail-suppliers?supplier=${doc.supplier_id}`}>{doc.supplier_name}</Link>:doc.supplier_name],
    doc.payment_method&&['Payment method',label(doc.payment_method)],
    doc.business_day_id&&['Business day',`#${doc.business_day_id}`],
    doc.reference&&doc.reference!==doc.number&&['Reference',doc.reference],
    doc.parent_id&&['Linked sale',<Link key="p" className="text-pink-700 hover:underline" href={`${cashier?'/cashier':'/admin'}/retail-sales-history/${doc.parent_id}`}>Sale #{doc.parent_id}</Link>],
  ].filter(Boolean);
  return <article className="k-doc">
    <header className="k-doc-hero">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="k-doc-kicker">{doc.label}</p><h3 className="k-doc-number">{doc.number||`#${doc.id}`}</h3>
          {doc.status&&<div className="mt-2"><Chip tone={statusTone(doc.status)}>{label(String(doc.status).toLowerCase())}</Chip></div>}</div>
        {doc.amount!=null&&<div className="text-right"><p className="text-xs font-semibold text-gray-500">Amount</p><Money value={doc.amount} className="k-doc-total mt-1 block"/></div>}
      </div>
      <dl className="k-doc-facts">{facts.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </header>
    {doc.amount==null&&<p className="k-note">No amount is shown here: this kind of record keeps its figures on its own page, or your role cannot see them. Use “Open in its workspace” for the lines.</p>}
    <p className="text-xs text-gray-500">Times are Nepal time. Amounts your role may not see are left blank.</p>
  </article>;
}

function AuditView({event}) {
  return <article className="k-doc">
    <header className="k-doc-hero">
      <p className="k-doc-kicker">{label(event.entity)}</p><h3 className="k-doc-number">{label(event.action)}</h3>
      <dl className="k-doc-facts">
        <div><dt>When</dt><dd>{when(event.occurred_at)}</dd></div>
        <div><dt>By</dt><dd>{event.actor||(event.actor_id?`User #${event.actor_id}`:'System')}</dd></div>
        <div><dt>Reference</dt><dd>{event.reference||'—'}</dd></div>
        <div><dt>Record</dt><dd>{event.entity_id?`#${event.entity_id}`:'—'}</dd></div>
      </dl>
    </header>
    {event.reason&&<p className="k-note"><strong>Reason:</strong> “{event.reason}”</p>}
    <ChangeTable before={event.before} after={event.after}/>
  </article>;
}

export default function EvidenceWorkspace({audit=false}) {
  const [filters,setFilters]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState(null);
  useEffect(()=>{
    const sync=()=>{setLoading(true);setError('');setFilters(Object.fromEntries(new URLSearchParams(window.location.search)));};
    sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);
  },[]);
  useEffect(()=>{
    if(!filters) return;
    let live=true;
    apiJson(`/api/admin/${audit?'retail-audit':'retail-transactions'}?${new URLSearchParams(filters)}`).then(value=>{if(live)setData(value);}).catch(e=>{if(live)setError(e.error||e.message||'Could not load or save this evidence.');}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[filters,audit]);
  function navigate(next) {window.history.pushState(null,'',`${window.location.pathname}?${new URLSearchParams(next)}`);setLoading(true);setError('');setFilters(next);setSelected(null);}
  const rows=audit?data?.events:data?.documents;
  const advancedCount=ADVANCED.filter(k=>filters?.[k]).length;
  const columns=audit?[
    {key:'occurred_at',label:'When',render:r=><span className="whitespace-nowrap">{when(r.occurred_at)}</span>},
    {key:'action',label:'What happened',render:r=><div><button type="button" className="block text-left font-bold hover:text-pink-700 hover:underline" onClick={()=>setSelected(r)}>{label(r.action)}</button><small className="text-gray-500">{label(r.entity)}{r.reference?` · ${r.reference}`:''}</small></div>},
    {key:'actor',label:'By',render:r=>r.actor||<span className="text-gray-500">System</span>},
    {key:'reason',label:'Reason',render:r=>r.reason?<span className="line-clamp-2 max-w-xs">{r.reason}</span>:<span className="text-gray-500">—</span>},
  ]:[
    {key:'number',label:'Document',render:r=><div className="flex items-center gap-2.5"><KindChip type={r.type}>{r.label}</KindChip><button type="button" className="font-bold text-gray-900 hover:text-pink-700 hover:underline" onClick={()=>setSelected(r)}>{r.number||`#${r.id}`}</button></div>},
    {key:'occurred_at',label:'Recorded',render:r=><span className="whitespace-nowrap">{when(r.occurred_at)}</span>},
    {key:'party',label:'Customer / supplier',render:r=>r.customer_name||r.supplier_name?<div><span className="block font-semibold">{r.customer_name||r.supplier_name}</span>{r.customer_phone&&<small className="text-gray-500">{r.customer_phone}</small>}</div>:<span className="text-gray-500">—</span>},
    {key:'status',label:'Status',render:r=>r.status?<Chip tone={statusTone(r.status)}>{label(String(r.status).toLowerCase())}</Chip>:<span className="text-gray-500">—</span>},
    {key:'amount',label:'Amount',numeric:true,render:r=>r.amount==null?<span className="text-gray-500">—</span>:<Money value={r.amount} className="font-bold"/>},
    {key:'actor',label:'By',render:r=>r.actor||<span className="text-gray-500">—</span>},
  ];
  const isSale=!audit&&selected?.type==='sale';
  return <AdminLayout><div className="commerce-page"><WorkspaceHeader eyebrow={audit?'Control':'Find anything'} title={audit?'Business Audit':'Transaction Explorer'} description={audit?'Who changed what, when, and why.':'Search every sale, return, purchase, expense and payment in one place. Click a row to open it.'}/>
    <section className="k-card overflow-hidden">
      <form key={`${JSON.stringify(filters)}:${data?.types?.length||0}`} className="grid gap-4 p-4 sm:p-5" onSubmit={e=>{e.preventDefault();navigate(Object.fromEntries([...new FormData(e.currentTarget)].filter(([,v])=>v)));}}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto] md:items-end">
          <label className="grid gap-1.5 text-sm font-semibold text-gray-700">Search<span className="relative"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/><input name="q" type="search" defaultValue={filters?.q||''} className={`${field} pl-9`} placeholder={audit?'Reference, action, reason or person':'Receipt or document number, customer, phone or supplier'}/></span></label>
          {audit?<Field filters={filters} name="entity" title="Area" placeholder="e.g. sale, expense"/>:<label className="grid gap-1.5 text-sm font-semibold text-gray-700">Type<select name="type" defaultValue={filters?.type||''} className={field}><option value="">All types</option>{data?.types?.map(t=><option key={t.type} value={t.type}>{t.label}</option>)}</select></label>}
          <Field filters={filters} name="from" title="From" type="date"/>
          <Field filters={filters} name="to" title="To" type="date"/>
        </div>
        <details className="group rounded-xl border border-gray-200 bg-gray-50/60" open={advancedCount>0||undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700"><SlidersHorizontal aria-hidden className="h-4 w-4 text-pink-600"/>More filters{advancedCount>0&&<span className="k-chip k-chip--pink">{advancedCount} on</span>}<span className="ml-auto text-xs font-semibold text-gray-500 group-open:hidden">Product, serial, amount, payment…</span></summary>
          <div className="grid gap-3 border-t border-gray-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {audit?<Field filters={filters} name="action" title="Action"/>:<>
              <Field filters={filters} name="product" title="Product, SKU or barcode"/>
              <Field filters={filters} name="status" title="Status" placeholder="e.g. COMPLETED"/>
              <Field filters={filters} name="payment_method" title="Payment method" placeholder="cash, online, credit"/>
              <Field filters={filters} name="business_day_id" title="Business day #" type="number" min="1"/>
              <Field filters={filters} name="min_amount" title="Minimum amount" type="number" step="0.01"/>
              <Field filters={filters} name="max_amount" title="Maximum amount" type="number" step="0.01"/>
              <Field filters={filters} name="serial" title="Exact serial number"/>
              <Field filters={filters} name="batch" title="Exact batch number"/>
            </>}
            <Field filters={filters} name="actor_id" title="Staff user #" type="number" min="1"/>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2"><Button type="submit"><Search className="mr-2 h-4 w-4" aria-hidden/>Apply filters</Button><Button type="button" variant="outline" onClick={()=>navigate({})}>Clear all</Button></div>
      </form>
      {!audit&&!!data?.types?.length&&<nav aria-label="Document types" className="flex gap-2 overflow-x-auto border-t border-gray-100 bg-white px-4 py-3 sm:px-5">
        {[{type:'',label:'Everything'},...data.types].map(t=>{const active=(filters?.type||'')===t.type;const k=kindOf(t.type);return <button key={t.type||'all'} type="button" aria-pressed={active} onClick={()=>navigate({...Object.fromEntries(Object.entries(filters||{}).filter(([key])=>key!=='page'&&key!=='type')),...(t.type?{type:t.type}:{})})}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${active?'border-pink-500 bg-pink-50 text-pink-800':'border-gray-200 bg-white text-gray-600 hover:border-pink-300'}`}>{t.type&&<k.icon aria-hidden className="h-3.5 w-3.5"/>}{t.label}</button>;})}
      </nav>}
    </section>
    <SavedEvidenceViews scope={audit?'audit':'transactions'} filters={filters} onSelect={navigate}/>
    <DataTable columns={columns} rows={rows||[]} rowKey="key" loading={loading} error={error} onRowOpen={setSelected} empty={<EmptyState title="Nothing matches" description="Try a wider date range, another type, or clear the filters."/>}/>
    <nav className="flex flex-wrap items-center justify-between gap-3 py-4" aria-label="Pages"><p className="text-xs text-gray-500">{data?.scope}</p><div className="flex items-center gap-3"><Button variant="outline" disabled={loading||!(data?.pagination?.page>1)} onClick={()=>navigate({...filters,page:String(data.pagination.page-1)})}>Previous</Button><span className="text-sm font-semibold">Page {data?.pagination?.page||1}</span><Button variant="outline" disabled={loading||!data?.pagination?.has_more} onClick={()=>navigate({...filters,page:String(data.pagination.page+1)})}>Next</Button></div></nav>
    <ActionDrawer open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}} wide={!isSale&&audit}
      title={selected?(audit?label(selected.action):`${selected.label} ${selected.number||`#${selected.id}`}`):'Details'}
      description={audit?'Recorded change, with before and after where available':isSale?'Full bill, payments and returns':'Recorded document facts'}
      footer={!isSale&&selected?.href&&<Button asChild><Link href={selected.href}>Open in its workspace</Link></Button>}>
      {selected&&(audit?<AuditView event={selected}/>:isSale?<SaleDetail key={selected.id} id={selected.id}/>:<DocumentView doc={selected}/>)}
    </ActionDrawer>
  </div></AdminLayout>;
}
