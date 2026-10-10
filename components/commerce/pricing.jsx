'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Pencil, Plus, ShieldCheck, Tag, Trash2, Users } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { formatNepalTime } from '@/lib/time-utils';
import { ActionDrawer } from '@/components/erp/primitives';
import MassPricing from './mass-pricing';
import { Badge, EmptyHint, Field, Notice, Page, PageHeader, Panel, SearchPicker, Toggle, inputClass, primaryButton, secondaryButton, smallButton } from './catalog-ui';

const CHANNELS = [{ id: '', label: 'Shop and online' }, { id: 'retail_pos', label: 'Shop counter only' }, { id: 'online', label: 'Online only' }];
const MARGIN_MODES = { off: 'Off', warn: 'Warn the cashier', manager: 'Block unless allowed to override price' };
// datetime-local works in the browser's local time; the API stores UTC ISO.
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = (local) => (local ? new Date(local).toISOString() : null);
const codeFrom = (name) => `${String(name || 'LIST').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'LIST'}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
const blank = () => ({ name: '', code: '', priority: 0, channel: '', customer_group_id: '', starts_at: '', ends_at: '', active: true, reason: 'New price list', items: [] });
const ACTION_LABELS = { PRICE_LIST: 'Price list saved', CUSTOMER_GROUP: 'Customer group saved', CUSTOMER_GROUP_ASSIGNMENT: 'Customer group assigned', CUSTOMER_ONLINE_INVITE: 'Online account code issued', ONLINE_PUBLISH: 'Online visibility changed', CATALOG_BULK: 'Variants saved', PRODUCT_MERCHANDISING: 'Online details saved', MARGIN_POLICY: 'Margin policy changed', MASS_PRICE: 'Bulk price change', STOREFRONT_SETTINGS: 'Online store settings', CATALOG_ATTRIBUTE: 'Attribute saved', CATALOG_BRAND: 'Brand saved', CATALOG_CATEGORY: 'Category saved' };

export default function Pricing() {
  const [data, setData] = useState({ lists: [], groups: [], audit: [], policy: null });
  const [draft, setDraft] = useState(null);
  const [group, setGroup] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [assignment, setAssignment] = useState({ customer: null, group_id: '', reason: 'Customer pricing group' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAllAudit, setShowAllAudit] = useState(false);
  const refresh = useCallback(async () => setData(await apiJson('/api/admin/commerce/pricing')), []);
  useEffect(() => { refresh().catch((e) => setError(e.error || 'Could not load pricing.')); }, [refresh]);
  const run = async (fn, done) => { setBusy(true); setError(''); try { await fn(); if (done) setMessage(done); } catch (e) { setError(e.message || e.error || 'Could not save.'); } finally { setBusy(false); } };
  const post = async (input) => { await apiJson('/api/admin/commerce/pricing', { method: 'POST', body: JSON.stringify(input) }); await refresh(); };
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const groupName = (id) => data.groups.find((g) => Number(g.id) === Number(id))?.name;
  const openList = (list) => run(async () => {
    const result = await apiJson(`/api/admin/commerce/pricing?id=${list.id}`);
    setDraft({ ...result.list, active: !!Number(result.list.active), channel: result.list.channel || '', customer_group_id: result.list.customer_group_id || '', starts_at: toLocalInput(result.list.starts_at), ends_at: toLocalInput(result.list.ends_at), items: result.items, reason: `Update ${result.list.name}` });
  });

  return (
    <>
      <PageHeader icon={Tag} tone="bg-orange-50 text-orange-600" title="Special prices"
        description="Optional. Each product's normal price is set on the product. Use this page for wholesale buyers, online-only prices, sales with start and end dates, or changing many prices at once."
        actions={<><MassPricing onSaved={async () => { await refresh(); setMessage('Prices updated.'); }} /><button type="button" className={primaryButton} onClick={() => setDraft(blank())}><Plus className="h-4 w-4" aria-hidden /> New price list</button></>} />
      <Page>
        <Notice onClose={() => setError('')}>{error}</Notice>
        <Notice tone="success" onClose={() => setMessage('')}>{message}</Notice>

        <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-sm md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          <div><p className="font-semibold text-gray-900">1. Normal price</p><p className="text-gray-500">Set on each product in Products or Merchandising.</p></div>
          <ArrowRight className="hidden h-4 w-4 text-gray-300 md:block" aria-hidden />
          <div><p className="font-semibold text-gray-900">2. Price list (if one matches)</p><p className="text-gray-500">Right channel, customer group, dates and quantity. Highest priority wins.</p></div>
          <ArrowRight className="hidden h-4 w-4 text-gray-300 md:block" aria-hidden />
          <div><p className="font-semibold text-gray-900">3. Offers & bundles</p><p className="text-gray-500">Discounts from Offers apply after, at the till.</p></div>
        </div>

        <Panel title="Price lists" description="Each list overrides the normal price for the products it names.">
          {data.lists.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.lists.map((list) => (
                <div key={list.id} className="flex flex-col justify-between gap-3 rounded-xl border border-gray-200 p-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-semibold text-gray-900">{list.name}</p><p className="text-xs text-gray-500">{list.code}</p></div>
                      {Number(list.active) ? <Badge tone="green">Active</Badge> : <Badge>Off</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone="blue">{CHANNELS.find((c) => c.id === (list.channel || ''))?.label}</Badge>
                      <Badge tone="violet">{list.customer_group_id ? groupName(list.customer_group_id) || 'Group' : 'All customers'}</Badge>
                      <Badge>Priority {list.priority}</Badge>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{list.starts_at ? formatNepalTime(list.starts_at) : 'Now'} → {list.ends_at ? formatNepalTime(list.ends_at) : 'no end'}</p>
                  </div>
                  <button type="button" className={smallButton} onClick={() => openList(list)} aria-label={`Edit ${list.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit prices</button>
                </div>
              ))}
            </div>
          ) : <EmptyHint icon={Tag} title="No price lists yet" action={<button type="button" className={secondaryButton} onClick={() => setDraft(blank())}>Create a price list</button>}>Use one for wholesale buyers, an online-only price, or a sale that starts and ends on set dates.</EmptyHint>}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Customer groups" description="Put regular or wholesale customers in a group, then give the group its own price list."
            actions={<button type="button" className={smallButton} onClick={() => setGroup({ name: '', code: '', pricing_mode: 'wholesale', active: true, reason: 'New customer group' })}><Plus className="h-3.5 w-3.5" aria-hidden /> New group</button>}>
            <div className="mb-4 flex flex-wrap gap-2">
              {data.groups.length ? data.groups.map((row) => (
                <button key={row.id} type="button" onClick={() => setGroup({ ...row, active: !!Number(row.active), reason: `Update ${row.name}` })} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                  <Users className="h-4 w-4 text-violet-600" aria-hidden /><span className="font-medium text-gray-900">{row.name}</span><Badge tone={row.pricing_mode === 'wholesale' ? 'amber' : 'gray'}>{row.pricing_mode}</Badge>
                </button>
              )) : <p className="text-sm text-gray-500">No groups yet.</p>}
            </div>
            <div className="space-y-3 rounded-xl bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Put a customer in a group</p>
              {assignment.customer
                ? <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><span><span className="font-medium">{assignment.customer.title}</span> <span className="text-gray-500">{assignment.customer.phone}</span></span><button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setAssignment({ ...assignment, customer: null })}>Change</button></div>
                : <SearchPicker group="customers" placeholder="Find customer by name or phone…" onPick={(row) => setAssignment({ ...assignment, customer: row })} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Group"><select className={inputClass} value={assignment.group_id} onChange={(e) => setAssignment({ ...assignment, group_id: e.target.value })}><option value="">Normal retail (no group)</option>{data.groups.filter((g) => Number(g.active)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
                <Field label="Note for the change log"><input className={inputClass} value={assignment.reason} onChange={(e) => setAssignment({ ...assignment, reason: e.target.value })} /></Field>
              </div>
              <button type="button" className={primaryButton} disabled={busy || !assignment.customer || !assignment.reason.trim()} onClick={() => run(async () => { await post({ action: 'assign_group', customer_id: assignment.customer.id, group_id: assignment.group_id, reason: assignment.reason }); setAssignment({ customer: null, group_id: '', reason: 'Customer pricing group' }); }, 'Customer group saved.')}>Save customer group</button>
            </div>
          </Panel>

          <Panel title="Margin protection" description="Stops selling below cost after discounts and offers."
            actions={<button type="button" className={smallButton} onClick={() => setPolicy({ mode: data.policy?.mode || 'off', minimum_percent: data.policy?.minimum_percent ?? 0, reason: 'Update margin policy' })}><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Change</button>}>
            <div className="flex items-center gap-4">
              <div className={`rounded-xl p-3 ${data.policy?.mode && data.policy.mode !== 'off' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}><ShieldCheck className="h-6 w-6" aria-hidden /></div>
              <div>
                <p className="font-semibold text-gray-900">{MARGIN_MODES[data.policy?.mode || 'off']}</p>
                <p className="text-sm text-gray-500">{data.policy?.mode && data.policy.mode !== 'off' ? `Minimum margin ${Number(data.policy.minimum_percent)}% on the final selling price.` : 'No margin check at the till.'}</p>
              </div>
            </div>
          </Panel>
        </div>

        <Panel title="Recent pricing changes" description="Who changed prices, and why.">
          {data.audit.length ? (
            <ul className="divide-y divide-gray-100 text-sm">
              {(showAllAudit ? data.audit : data.audit.slice(0, 8)).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span><span className="font-medium text-gray-900">{ACTION_LABELS[row.action] || row.action.replaceAll('_', ' ').toLowerCase()}</span>{row.reason && <span className="text-gray-500"> — {row.reason}</span>}</span>
                  <span className="text-xs text-gray-500">{row.actor_name || 'Unknown'} · {formatNepalTime(row.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-500">No pricing changes yet.</p>}
          {data.audit.length > 8 && <button type="button" className={`${smallButton} mt-3`} onClick={() => setShowAllAudit((v) => !v)}>{showAllAudit ? 'Show fewer' : `Show all ${data.audit.length}`}</button>}
        </Panel>
      </Page>

      <ActionDrawer open={!!draft} onOpenChange={(open) => { if (!open) setDraft(null); }} title={draft?.id ? 'Edit price list' : 'New price list'} description="Times are your local time. The list only applies inside its dates."
        footer={draft && <button type="button" className={`${primaryButton} w-full`} disabled={busy || !draft.name.trim() || !draft.reason.trim() || !draft.items.length} onClick={() => run(async () => { await post({ action: 'price_list', ...draft, code: draft.code?.trim() || codeFrom(draft.name), starts_at: toIso(draft.starts_at), ends_at: toIso(draft.ends_at) }); setDraft(null); }, 'Price list saved.')}>{draft.items.length ? 'Save price list' : 'Add at least one product'}</button>}>
        {draft && (
          <div className="space-y-4">
            <Field label="Name"><input className={inputClass} value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Wholesale prices" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Where it applies"><select className={inputClass} value={draft.channel || ''} onChange={(e) => update('channel', e.target.value)}>{CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
              <Field label="Who gets it"><select className={inputClass} value={draft.customer_group_id || ''} onChange={(e) => update('customer_group_id', e.target.value)}><option value="">Every customer</option>{data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
              <Field label="Starts" hint="Blank = now."><input type="datetime-local" className={inputClass} value={draft.starts_at || ''} onChange={(e) => update('starts_at', e.target.value)} /></Field>
              <Field label="Ends" hint="Blank = no end."><input type="datetime-local" className={inputClass} value={draft.ends_at || ''} onChange={(e) => update('ends_at', e.target.value)} /></Field>
              <Field label="Priority" hint="When two lists match, the higher number wins."><input type="number" className={inputClass} value={draft.priority} onChange={(e) => update('priority', e.target.value)} /></Field>
              <Field label="Code" hint="Blank = made from the name."><input className={inputClass} value={draft.code || ''} onChange={(e) => update('code', e.target.value)} /></Field>
            </div>
            <Toggle checked={draft.active} onChange={(v) => update('active', v)} label="List is switched on" />

            <div className="rounded-xl border border-gray-200 p-3">
              <p className="mb-2 text-sm font-semibold text-gray-900">Products and prices</p>
              <SearchPicker placeholder="Add a product…" onPick={(row) => update('items', [...draft.items, { variant_id: row.id, sku: row.sku, product_name: `${row.title}${row.variant_name && row.variant_name !== 'Standard' ? ` · ${row.variant_name}` : ''}`, normal_price: row.price, min_quantity: 1, fixed_price: row.price, adjustment_percent: null }])} />
              <div className="mt-3 space-y-2">
                {draft.items.map((item, index) => {
                  const percent = item.adjustment_percent != null && item.adjustment_percent !== '';
                  const change = (patch) => update('items', draft.items.map((row, i) => i === index ? { ...row, ...patch } : row));
                  return (
                    <div key={index} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{item.product_name || (item.variant_id ? `SKU #${item.variant_id}` : `Product #${item.product_id}`)}</p><p className="text-xs text-gray-500">{item.sku}{item.normal_price != null ? ` · normal ${formatCurrency(item.normal_price)}` : ''}</p></div>
                        <button type="button" aria-label={`Remove rule ${index + 1}`} onClick={() => update('items', draft.items.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" aria-hidden /></button>
                      </div>
                      <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-end gap-2">
                        <Field label="From qty"><input aria-label={`min_quantity rule ${index + 1}`} type="number" min="1" className={`${inputClass} w-20`} value={item.min_quantity ?? 1} onChange={(e) => change({ min_quantity: e.target.value })} /></Field>
                        <Field label={percent ? 'Change %' : 'Price'}>
                          <input aria-label={`${percent ? 'adjustment_percent' : 'fixed_price'} rule ${index + 1}`} type="number" step="0.01" className={inputClass} value={(percent ? item.adjustment_percent : item.fixed_price) ?? ''} onChange={(e) => change(percent ? { adjustment_percent: e.target.value, fixed_price: null } : { fixed_price: e.target.value, adjustment_percent: null })} />
                        </Field>
                        <div className="flex rounded-lg border border-gray-300 p-0.5 text-xs font-semibold">
                          <button type="button" aria-pressed={!percent} onClick={() => change({ fixed_price: item.fixed_price ?? item.normal_price ?? 0, adjustment_percent: null })} className={`rounded-md px-2 py-1.5 ${!percent ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>Rs</button>
                          <button type="button" aria-pressed={percent} onClick={() => change({ adjustment_percent: item.adjustment_percent ?? -10, fixed_price: null })} className={`rounded-md px-2 py-1.5 ${percent ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>%</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!draft.items.length && <p className="text-sm text-gray-500">Add the products this list should price.</p>}
              </div>
            </div>
            <Field label="Note for the change log"><input className={inputClass} value={draft.reason} onChange={(e) => update('reason', e.target.value)} /></Field>
          </div>
        )}
      </ActionDrawer>

      <ActionDrawer open={!!group} onOpenChange={(open) => { if (!open) setGroup(null); }} title={group?.id ? 'Edit customer group' : 'New customer group'}
        footer={group && <button type="button" className={`${primaryButton} w-full`} disabled={busy || !group.name.trim()} onClick={() => run(async () => { await post({ action: 'customer_group', ...group, code: group.code?.trim() || codeFrom(group.name) }); setGroup(null); }, 'Customer group saved.')}>Save group</button>}>
        {group && (
          <div className="space-y-4">
            <Field label="Name"><input className={inputClass} value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })} placeholder="e.g. Wholesale buyers" /></Field>
            <Field label="Pricing type" hint="Wholesale groups get the wholesale price set on each product."><select className={inputClass} value={group.pricing_mode} onChange={(e) => setGroup({ ...group, pricing_mode: e.target.value })}><option value="retail">Retail</option><option value="wholesale">Wholesale</option></select></Field>
            <Field label="Code" hint="Blank = made from the name."><input className={inputClass} value={group.code || ''} onChange={(e) => setGroup({ ...group, code: e.target.value })} /></Field>
            <Field label="Note for the change log"><input className={inputClass} value={group.reason} onChange={(e) => setGroup({ ...group, reason: e.target.value })} /></Field>
          </div>
        )}
      </ActionDrawer>

      <ActionDrawer open={!!policy} onOpenChange={(open) => { if (!open) setPolicy(null); }} title="Margin protection"
        footer={policy && <button type="button" className={`${primaryButton} w-full`} disabled={busy || !policy.reason.trim()} onClick={() => run(async () => { await post({ action: 'margin_policy', ...policy }); setPolicy(null); }, 'Margin protection saved.')}>Save</button>}>
        {policy && (
          <div className="space-y-4">
            <div className="space-y-2">
              {Object.entries(MARGIN_MODES).map(([mode, label]) => (
                <label key={mode} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${policy.mode === mode ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                  <input type="radio" name="margin-mode" checked={policy.mode === mode} onChange={() => setPolicy({ ...policy, mode })} />
                  <span className="text-sm font-semibold text-gray-900">{label}</span>
                </label>
              ))}
            </div>
            {policy.mode !== 'off' && <Field label="Minimum margin %" hint="Example: 10 means the final price must be at least 10% above cost."><input type="number" min="0" max="100" className={inputClass} value={policy.minimum_percent} onChange={(e) => setPolicy({ ...policy, minimum_percent: e.target.value })} /></Field>}
            <Field label="Note for the change log"><input className={inputClass} value={policy.reason} onChange={(e) => setPolicy({ ...policy, reason: e.target.value })} /></Field>
          </div>
        )}
      </ActionDrawer>
    </>
  );
}

