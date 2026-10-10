'use client';
import { useEffect, useState } from 'react';
import { ActionDrawer, InlineAlert } from '@/components/erp/primitives';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
export default function SerialPicker({ row, selected, onSelect, onClose }) {
  const [query,setQuery] = useState('');
  const [page,setPage] = useState(1);
  const [state,setState] = useState({ serials: [], loading: true });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await apiJson(`/api/admin/retail-serials?${new URLSearchParams({ variantId: row.variantId, q: query, page })}`, { signal: controller.signal });
        if (!controller.signal.aborted) setState({ ...data, loading: false });
      } catch (error) { if (!controller.signal.aborted) setState({ serials: [], error: error.error || 'Serial lookup unavailable' }); }
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [row.variantId, query, page]);
  const rows = state.serials.filter((s) => !selected.includes(s.serial_number));
  return <ActionDrawer open onOpenChange={(open) => { if (!open) onClose(); }} title="Select serial number" description={`${row.productName} · Available at the selling location`}>
    <div className="commerce-form"><label>Scan or search serial<input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const exact = rows.find((s) => s.serial_number === query); if (exact) onSelect(exact.serial_number); } }} /></label>
      {state.error && <InlineAlert tone="error">{state.error}</InlineAlert>}
      {state.loading && <p role="status">Checking serial availability…</p>}
      {rows.map((serial) => <Button variant="outline" key={serial.id} onClick={() => onSelect(serial.serial_number)}>{serial.serial_number}</Button>)}
      {!rows.length && !state.loading && <p>No matching available serials. Already selected serials are excluded.</p>}
      <div className="commerce-filters"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button disabled={!state.has_more} onClick={() => setPage(page + 1)}>Next</Button></div>
    </div>
  </ActionDrawer>;
}
