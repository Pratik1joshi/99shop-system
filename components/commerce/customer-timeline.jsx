'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { formatNepalTime } from '@/lib/time-utils';
import { Button } from '@/components/ui/button';

export default function CustomerTimeline({ customerId, revision }) {
  const query = useSearchParams();
  const sourceType = query.get('timeline_source') || '';
  const sourceId = query.get('timeline_id') || '';
  const [channel,setChannel]=useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    let active = true;
    apiJson(`/api/admin/retail-customers/${customerId}/timeline?${new URLSearchParams({ page: sourceId ? '1' : String(page), source_type: sourceType, source_id: sourceId,channel })}`).then((data) => {
      if (active) setState({ data, error: '', loading: false });
    }).catch((error) => { if (active) setState({ data: null, error: error.error || error.message, loading: false }); });
    return () => { active = false; };
  }, [customerId, page, revision, sourceType, sourceId,channel]);
  const go = (next) => { setState({ data: null, error: '', loading: true }); setPage(next); };
  return <section className="retail-money-card" aria-label="Commerce timeline"><h2>Commerce timeline</h2><label>Channel<select value={channel} onChange={e=>{setChannel(e.target.value);setPage(1);}}><option value="">All activity</option><option value="retail_pos">In store</option><option value="online">Online</option></select></label>
    <p>{state.data?.scope || 'Canonical source events in chronological order.'}</p>
    {sourceId && <Link href={`/admin/retail-customers/${customerId}`} className="underline">Show complete timeline</Link>}
    {state.loading && <p role="status">Loading timeline…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    <ol className="retail-money-timeline">{state.data?.events.map((event) => <li key={event.key} id={`timeline-${event.source_type}-${event.id}`}>
      <small>{formatNepalTime(event.occurred_at)}</small><strong>{event.event} · {event.reference}</strong>
      <span>{event.amount == null ? `${event.points} points` : formatCurrency(event.amount)}</span>
      {event.reason && <span>{event.reason}</span>}<small>Source: {event.source_type} #{event.id}</small><Link href={event.href}>View source</Link>
    </li>)}</ol>
    {state.data && !state.data.events.length && <p>No Retail activity on this page.</p>}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={state.loading || page === 1} onClick={() => go(page - 1)}>Previous</Button><span>Page {page}</span><Button variant="outline" disabled={state.loading || !state.data?.pagination.has_more} onClick={() => go(page + 1)}>Next</Button></div>
  </section>;
}
