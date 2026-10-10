'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useCommerceSearch } from './use-commerce-search';

export default function EntitySearch({ query, open, onSelect }) {
  const [continuation, setContinuation] = useState({ query: '', group: '', page: 1 });
  const current = continuation.query === query ? continuation : { group: '', page: 1 };
  const { groups, loading, error } = useCommerceSearch(query, { enabled: open && !!query.trim(), ...current });
  if (!query.trim()) return null;
  return <section aria-label="Commerce results" aria-busy={loading}>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Searching commerce…</p>}
    {groups.map((group) => <div key={group.key}><h3>{group.key}</h3>{group.results.map((row) => <Link key={row.id} href={row.href} onClick={onSelect}><span>{row.title || row.sku || `#${row.id}`} {row.variant_name && row.variant_name !== 'Standard' ? row.variant_name : ''}</span><small>{row.exact_match ? 'Exact match · ' : ''}{row.status || row.phone || row.sku}</small></Link>)}{group.has_more && <button type="button" onClick={() => setContinuation({ query, group: group.key, page: group.page + 1 })}>More {group.key}</button>}</div>)}
  </section>;
}
