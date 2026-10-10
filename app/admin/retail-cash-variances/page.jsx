'use client';
import {useEffect,useState,useCallback} from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import {WorkspaceHeader,DataTable,Money,ActionDrawer,InlineAlert,EmptyState} from '@/components/erp/primitives';
import {Button} from '@/components/ui/button';
import {apiJson} from '@/lib/authed-fetch';
export default function CashVariancePage(){
  const [status,setStatus]=useState('UNREVIEWED'),[page,setPage]=useState(1),[data,setData]=useState(null),[selected,setSelected]=useState(null),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(()=>apiJson(`/api/admin/retail-cash-variances?status=${status}&page=${page}`).then(setData).catch(e=>setError(e.error||e.message||'Could not load or save this evidence.')),[status,page]);
  useEffect(()=>{load();},[load]);
  async function review(next){setBusy(true);setError('');try{await apiJson('/api/admin/retail-cash-variances',{method:'POST',body:JSON.stringify({sessionId:selected.id,status:next,resolutionNote:note})});setSelected(null);setNote('');await load();}catch(e){setError(e.error||e.message||'Could not load or save this evidence.');}finally{setBusy(false);}}
  const open=row=>{setSelected(row);setNote('');setError('');};
  return <AdminLayout><div className="commerce-page"><WorkspaceHeader eyebrow="Finance / Registers & Cash" title="Cash variance review" description="Review recorded closing differences. Acceptance records a decision and leaves counted cash and accounting unchanged."/>
    <div className="commerce-filters"><label htmlFor="cash-review-status">Review status</label><select id="cash-review-status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);setData(null);setError('');}}>{['UNREVIEWED','ACCEPTED','ESCALATED','ALL'].map(s=><option key={s}>{s}</option>)}</select></div>
    {error&&<InlineAlert tone="error">{error}</InlineAlert>}<p>{data?.scope}</p>
    <DataTable rows={data?.variances||[]} loading={!data&&!error} columns={[
      {key:'business_date',label:'Business day'},{key:'session_number',label:'Session',render:r=><button className="underline" onClick={()=>open(r)}>Session {r.session_number}</button>},
      {key:'cashier',label:'Cashier'},{key:'expected_cash',label:'Expected',render:r=><Money value={r.expected_cash}/>},
      {key:'counted_cash',label:'Counted',render:r=><Money value={r.counted_cash}/>},{key:'cash_difference',label:'Variance',render:r=><Money value={r.cash_difference}/>},
      {key:'review_status',label:'Review'},{key:'reviewer',label:'Reviewer'},
    ]} onRowOpen={open} empty={<EmptyState title="No cash differences in this view" description="Choose another review status to inspect previously reviewed sessions."/>}/>
    <div className="flex gap-3 py-3"><Button variant="outline" disabled={page<=1} onClick={()=>{setData(null);setPage(page-1);}}>Previous</Button><span>Page {page}</span><Button variant="outline" disabled={!data?.pagination.has_more} onClick={()=>{setData(null);setPage(page+1);}}>Next</Button></div>
    <ActionDrawer open={!!selected} onOpenChange={v=>{if(!v)setSelected(null);}} title="Closing cash evidence" description="Recorded at session close">
      {selected&&<div className="space-y-4"><dl className="grid grid-cols-2 gap-3">{['business_day_id','drawer_session_id','cashier','closing_note','review_status','reviewer','reviewed_at','resolution_note'].map(k=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{selected[k]??'Not recorded'}</dd></div>)}{['opening_cash','expected_cash','counted_cash','cash_difference','tolerance'].map(k=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd><Money value={selected[k]}/></dd></div>)}</dl>
        <h2>Cash breakdown at close</h2>{selected.breakdown?<dl className="grid grid-cols-2 gap-3">{Object.entries(selected.breakdown).filter(([,v])=>typeof v==='number').map(([k,v])=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd><Money value={v}/></dd></div>)}</dl>:<p>No historical breakdown was recorded.</p>}
        <Link href="/admin/retail-registers" className="underline">Open Registers &amp; Cash</Link>
        {selected.review_status!=='ACCEPTED'&&<div className="commerce-form"><label>Resolution note<textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} className="border rounded p-2"/></label><div className="flex gap-2"><Button disabled={busy||!note.trim()} onClick={()=>review('ACCEPTED')}>Accept variance</Button><Button variant="outline" disabled={busy||!note.trim()} onClick={()=>review('ESCALATED')}>Escalate</Button></div></div>}
        {error&&<InlineAlert tone="error">{error}</InlineAlert>}
      </div>}
    </ActionDrawer>
  </div></AdminLayout>;
}
