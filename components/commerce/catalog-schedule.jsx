'use client';
import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { ActionDrawer } from '@/components/erp/primitives';
import { Field, Notice, inputClass, primaryButton, smallButton } from './catalog-ui';

/** Turns the selected grid prices into a price list that starts later. */
export default function CatalogSchedule({ rows, reason, onSaved }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button type="button" className={smallButton} disabled={!rows.length || rows.some((row) => !row.id)} title={rows.some((row) => !row.id) ? 'Save new variants first' : undefined} onClick={() => setOpen(true)}><CalendarClock className="h-3.5 w-3.5" aria-hidden /> Schedule prices</button>
      <ActionDrawer open={open} onOpenChange={setOpen} title="Schedule these prices" description="The selected grid prices start at the time you pick. Until then the current prices stay."
        footer={<button type="button" className={`${primaryButton} w-full`} disabled={busy || !name.trim() || !start || !reason.trim()} onClick={async () => {
          setBusy(true); setError('');
          try {
            await apiJson('/api/admin/commerce/pricing', { method: 'POST', body: JSON.stringify({ action: 'price_list', name, code: `SCHEDULE-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`, priority: 10, channel, starts_at: new Date(start).toISOString(), reason, items: rows.map((row) => ({ variant_id: row.id, min_quantity: 1, fixed_price: Number(row.price) })) }) });
            setOpen(false); onSaved(`Scheduled ${rows.length} prices from ${new Date(start).toLocaleString()}. You can edit it in Pricing.`);
          } catch (e) { setError(e.error || e.message || 'Could not schedule prices.'); } finally { setBusy(false); }
        }}>Schedule {rows.length} price{rows.length === 1 ? '' : 's'}</button>}>
        <div className="space-y-4">
          <Notice onClose={() => setError('')}>{error}</Notice>
          <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dashain sale prices" /></Field>
          <Field label="Starts (your local time)"><input type="datetime-local" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Where"><select className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Shop and online</option><option value="retail_pos">Shop counter only</option><option value="online">Online only</option></select></Field>
          <p className="text-xs text-gray-500">Change log note: {reason || 'enter one in the grid first.'}</p>
        </div>
      </ActionDrawer>
    </>
  );
}
