'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiJson } from '@/lib/authed-fetch';
import { WorkspaceHeader, DataTable, InlineAlert, Money } from '@/components/erp';
import { formatNepalDate, formatNepalTime } from '@/lib/time-utils';

export default function JournalEvidence() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; apiJson(`/api/admin/retail-journals/${id}`).then((value) => { if(active) setData(value); }).catch((e) => { if(active) setError(e.error || e.message); }); return () => { active=false; }; }, [id]);
  if (error) return <InlineAlert tone="error">{error}</InlineAlert>;
  if (!data) return <p role="status">Loading journal evidence…</p>;
  return <div className="retail-money-page"><WorkspaceHeader eyebrow="FINANCE / JOURNAL" title={`Journal #${data.journal.id}`} description={data.journal.memo} />
    <section className="retail-money-card"><h2>{data.source.label}{data.source.id ? ` #${data.source.id}` : ''}</h2>
      <p>Accounting date {formatNepalDate(data.journal.entry_date)} · Recorded {formatNepalTime(data.journal.created_at)} · {data.journal.actor || 'Actor not recorded'}</p>
      {data.source.href && data.source.href !== `/admin/retail-journals/${id}` && <Link className="underline" href={data.source.href}>Open source document</Link>}
      <dl className="grid gap-4 py-4 sm:grid-cols-2">{data.facts.map((fact) => <div key={fact.key}><dt className="text-sm capitalize text-muted-foreground">{fact.label}</dt><dd>{/(amount|total)$/.test(fact.key) ? <Money value={fact.value}/> : /_at$/.test(fact.key) ? formatNepalTime(fact.value) : String(fact.value)}</dd></div>)}</dl>
      {!data.facts.length && <p>The journal is the recorded financial evidence for this source.</p>}
    </section><section className="retail-money-card"><h2>Accounting effect</h2>
      <DataTable rows={data.lines} columns={[{key:'code',label:'Account',render:(line)=><Link className="underline" href={`/admin/general-ledger?account_code=${line.code}`}>{line.code} · {line.name}</Link>},{key:'memo',label:'Detail'},{key:'debit',label:'Debit',numeric:true,render:(line)=><Money value={line.debit}/>},{key:'credit',label:'Credit',numeric:true,render:(line)=><Money value={line.credit}/>}]} />
      {data.lines_truncated && <InlineAlert tone="warning">This journal exceeds 500 lines. The view is truncated; totals are not shown.</InlineAlert>}
    </section><section className="retail-money-card"><h2>Reversal history</h2>{data.reversals.length ? data.reversals.map((row)=><p key={row.id}><Link className="underline" href={`/admin/retail-journals/${row.id}`}>Journal #{row.id}</Link> · {row.memo}</p>) : <p>No reversal recorded.</p>}</section>
  </div>;
}
