'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Layers, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { ActionDrawer } from '@/components/erp/primitives';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { Badge, EmptyHint, Field, ImageUploadButton, Notice, Page, PageHeader, Panel, Toggle, inputClass, primaryButton, secondaryButton, smallButton, textareaClass } from './catalog-ui';

const TABS = [
  { id: 'categories', label: 'Categories', icon: FolderOpen, action: 'category', help: 'How the shop and the online store are organised. Lower display order shows first.' },
  { id: 'brands', label: 'Brands', icon: Tag, action: 'brand', help: 'Brands group products for search, filters and reports.' },
  { id: 'attributes', label: 'Colour & size lists', icon: Layers, action: 'attribute', help: 'Optional. Shared lists such as Colour or Size. You can also just type colours and sizes on a product.' },
];

const blankDraft = (action, row = null) => {
  if (action === 'attribute') return { action, id: row?.id, name: row?.name || '', display_order: row?.display_order ?? 0, online_filter: !!Number(row?.online_filter), values: row?.values?.length ? row.values.map((v) => ({ id: v.id, value: v.value, short_code: v.short_code || '', swatch: v.swatch || '', existing: true })) : [{ value: '', short_code: '', swatch: '' }], reason: row ? `Update ${row.name} attribute` : 'New attribute' };
  if (action === 'brand') return { action, id: row?.id, name: row?.name || '', description: row?.description || '', logo_url: row?.logo_url || '', active: row ? !!Number(row.active) : true, reason: row ? `Update brand ${row.name}` : 'New brand' };
  return { action, id: row?.id, name: row?.name || '', display_order: row?.display_order ?? 0, active: row ? !!Number(row.is_active) : true, online_enabled: row ? !!Number(row.online_enabled) : true, image_url: row?.image_url || '', description: row?.description || '', reason: row ? `Update category ${row.name}` : 'New category' };
};

export default function CatalogSetup() {
  const [data, setData] = useState({ attributes: [], brands: [], categories: [] });
  const [tab, setTab] = useState('categories');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const load = useCallback(() => apiJson('/api/admin/commerce/catalog-setup').then(setData).catch((e) => setError(e.error || 'Could not load catalog setup.')), []);
  useEffect(() => { load(); }, [load]);
  // Products links here with ?tab=attributes.
  const setTabOnMount = useRef(setTab);
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (TABS.some((x) => x.id === t)) setTabOnMount.current(t); }, []);
  const current = TABS.find((t) => t.id === tab);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function remove(kind, id) {
    setSaving(true); setError('');
    try {
      await apiJson(`/api/admin/commerce/catalog-setup?kind=${kind}&id=${id}`, { method: 'DELETE' });
      await load();
      return true;
    } catch (e) { setError(e.error || 'Could not remove this.'); return false; } finally { setSaving(false); }
  }
  async function removeValue(index) {
    const value = draft.values[index];
    if (value.id && !(await remove('attribute_value', value.id))) return;
    set({ values: draft.values.filter((_, i) => i !== index) });
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const values = draft.action === 'attribute' ? draft.values.filter((v) => v.value.trim()).map((v) => ({ value: v.value.trim(), short_code: v.short_code.trim(), swatch: v.swatch })) : undefined;
      await apiJson('/api/admin/commerce/catalog-setup', { method: 'POST', body: JSON.stringify({ ...draft, values }) });
      await load(); setDraft(null);
    } catch (e) { setError(e.error || 'Could not save.'); } finally { setSaving(false); }
  }

  return (
    <>
      <PageHeader icon={Layers} tone="bg-teal-50 text-teal-700" title="Categories & brands" description="How your products are grouped. Colours and sizes are added on each product." />
      <Page>
        <Notice onClose={() => setError('')}>{error}</Notice>
        <div role="tablist" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === t.id ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
              <t.icon className="h-4 w-4" aria-hidden />{t.label}<span className={`rounded-full px-1.5 text-xs ${tab === t.id ? 'bg-white/20' : 'bg-gray-100'}`}>{data[t.id].length}</span>
            </button>
          ))}
        </div>

        <Panel title={current.label} description={current.help} actions={<button type="button" className={primaryButton} onClick={() => setDraft(blankDraft(current.action))}><Plus className="h-4 w-4" aria-hidden /> New {current.action}</button>}>
          {tab === 'attributes' && (data.attributes.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.attributes.map((row) => (
                <div key={row.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-semibold text-gray-900">{row.name}</p><p className="text-xs text-gray-500">{row.values.length} value{row.values.length === 1 ? '' : 's'}{Number(row.online_filter) ? ' · online filter' : ''}</p></div>
                    <button type="button" className={smallButton} onClick={() => setDraft(blankDraft('attribute', row))} aria-label={`Edit ${row.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {row.values.slice(0, 16).map((v) => (
                      <span key={v.id} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
                        {v.swatch && <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: v.swatch }} />}{v.value}{v.short_code ? <span className="text-gray-400">{v.short_code}</span> : null}
                      </span>
                    ))}
                    {row.values.length > 16 && <span className="text-xs text-gray-500">+{row.values.length - 16} more</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyHint icon={Layers} title="No attributes yet" action={<button type="button" className={secondaryButton} onClick={() => setDraft(blankDraft('attribute'))}>Create the first attribute</button>}>Example: <strong>Colour</strong> with Pink, Black, Gold. Then build variants in Merchandising.</EmptyHint>)}

          {tab === 'brands' && (data.brands.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.brands.map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{row.name}</p>
                    <p className="text-xs text-gray-500">{row.product_count} product{Number(row.product_count) === 1 ? '' : 's'}</p>
                    {row.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{row.description}</p>}
                    <div className="mt-2">{Number(row.active) ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</div>
                  </div>
                  <button type="button" className={smallButton} onClick={() => setDraft(blankDraft('brand', row))} aria-label={`Edit ${row.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>
                </div>
              ))}
            </div>
          ) : <EmptyHint icon={Tag} title="No brands yet" action={<button type="button" className={secondaryButton} onClick={() => setDraft(blankDraft('brand'))}>Add a brand</button>}>Add the brands you sell so staff and customers can filter by them.</EmptyHint>)}

          {tab === 'categories' && (data.categories.length ? (
            <ul className="divide-y divide-gray-100">
              {data.categories.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-600" title="Display order">{row.display_order}</span>
                  {row.image_url ? <img src={toPublicImageUrl(row.image_url)} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-gray-200" /> : <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400" title="No picture yet"><FolderOpen className="h-4 w-4" aria-hidden /></span>}
                  <span className="min-w-0 flex-1 font-medium text-gray-900">{row.name}</span>
                  {Number(row.is_active) ? <Badge tone="green">In use</Badge> : <Badge>Hidden</Badge>}
                  {Number(row.online_enabled) ? <Badge tone="blue">Online store</Badge> : <Badge>Shop only</Badge>}
                  <button type="button" className={smallButton} onClick={() => setDraft(blankDraft('category', row))} aria-label={`Edit ${row.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>
                </li>
              ))}
            </ul>
          ) : <EmptyHint icon={FolderOpen} title="No categories yet">Create categories such as Hair clips, Earrings or Cosmetics.</EmptyHint>)}
        </Panel>
      </Page>

      <ActionDrawer open={!!draft} onOpenChange={(open) => { if (!open) { setDraft(null); setConfirmDelete(false); } }}
        title={draft ? `${draft.id ? 'Edit' : 'New'} ${draft.action}` : ''}
        description={draft?.action === 'attribute' ? 'Existing values keep their identity, so products using them are not affected.' : undefined}
        footer={draft && <button type="button" className={`${primaryButton} w-full`} disabled={saving || !draft.name.trim() || !draft.reason.trim()} onClick={save}>{saving ? 'Saving…' : `Save ${draft.action}`}</button>}>
        {draft && (
          <div className="space-y-4">
            <Field label="Name" hint={draft.action === 'attribute' && draft.id ? 'An attribute name cannot be changed after it is used.' : undefined}>
              <input className={inputClass} value={draft.name} disabled={draft.action === 'attribute' && !!draft.id} onChange={(e) => set({ name: e.target.value })} placeholder={draft.action === 'attribute' ? 'e.g. Colour' : draft.action === 'brand' ? 'e.g. Sanrio' : 'e.g. Hair clips'} />
            </Field>

            {draft.action === 'attribute' && (
              <>
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">Values</span>
                  <div className="space-y-2">
                    {draft.values.map((v, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input className={inputClass} aria-label={`Value ${index + 1}`} placeholder="e.g. Pink" disabled={v.existing} title={v.existing ? 'Saved values keep their name so products using them are not affected' : undefined} value={v.value} onChange={(e) => set({ values: draft.values.map((x, i) => i === index ? { ...x, value: e.target.value } : x) })} />
                        <input className={`${inputClass} w-24`} aria-label={`Short code ${index + 1}`} placeholder="Code" maxLength={20} value={v.short_code} onChange={(e) => set({ values: draft.values.map((x, i) => i === index ? { ...x, short_code: e.target.value.toUpperCase() } : x) })} />
                        <input type="color" aria-label={`Swatch colour ${index + 1}`} value={v.swatch || '#ffffff'} onChange={(e) => set({ values: draft.values.map((x, i) => i === index ? { ...x, swatch: e.target.value } : x) })} className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-300 p-1" />
                        {v.swatch && <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => set({ values: draft.values.map((x, i) => i === index ? { ...x, swatch: '' } : x) })}>No colour</button>}
                        <button type="button" aria-label={`Remove value ${v.value || index + 1}`} title={v.existing ? 'Remove from this list (only if no product version uses it)' : 'Remove'} disabled={saving} onClick={() => removeValue(index)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={`${smallButton} mt-2`} onClick={() => set({ values: [...draft.values, { value: '', short_code: '', swatch: '' }] })}><Plus className="h-3.5 w-3.5" aria-hidden /> Add value</button>
                  <p className="mt-1 text-xs text-gray-500">Short code is used in generated SKUs (e.g. PNK). Colour shows as a swatch online.</p>
                </div>
                <Toggle checked={draft.online_filter} onChange={(v) => set({ online_filter: v })} label="Show as a filter in the online store" />
              </>
            )}

            {draft.action === 'brand' && (
              <>
                <Field label="Description"><textarea rows={3} className={textareaClass} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
                <Field label="Logo URL" hint="Optional. Must start with https://"><input className={inputClass} value={draft.logo_url} onChange={(e) => set({ logo_url: e.target.value })} placeholder="https://…" /></Field>
                <Toggle checked={draft.active} onChange={(v) => set({ active: v })} label="Active" />
              </>
            )}

            {draft.action === 'category' && (
              <>
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">Picture</span>
                  <div className="flex items-center gap-4">
                    {draft.image_url ? <img src={toPublicImageUrl(draft.image_url)} alt="" className="h-24 w-24 rounded-2xl object-cover ring-1 ring-gray-200" /> : <span className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 text-gray-400"><FolderOpen className="h-6 w-6" aria-hidden /></span>}
                    <div className="flex flex-col items-start gap-1.5">
                      <ImageUploadButton label={draft.image_url ? 'Change picture' : 'Upload picture'} onUploaded={(url) => set({ image_url: url })} />
                      {draft.image_url && <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => set({ image_url: '' })}>Remove picture</button>}
                      <p className="text-xs text-gray-500">Shown on the online store’s category cards. Square photos look best. Without one, the store uses a product photo.</p>
                    </div>
                  </div>
                </div>
                <Field label="Description for the online store" hint="One or two friendly sentences shown at the top of this category's page and on Google. Leave blank for a simple default.">
                  <textarea rows={3} maxLength={600} className={textareaClass} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Soft claw clips in gingham, bows and cloud shapes — new pieces every week." />
                </Field>
                <Field label="Display order" hint="Lower numbers show first."><input type="number" className={inputClass} value={draft.display_order} onChange={(e) => set({ display_order: e.target.value })} /></Field>
                <Toggle checked={draft.active} onChange={(v) => set({ active: v })} label="In use" description="Hidden categories are not offered when adding products." />
                <Toggle checked={draft.online_enabled} onChange={(v) => set({ online_enabled: v })} label="Show in the online store" />
              </>
            )}

            {draft.action === 'attribute' && <Field label="Display order"><input type="number" className={inputClass} value={draft.display_order} onChange={(e) => set({ display_order: e.target.value })} /></Field>}
            <Field label="Note for the change log" hint="Saved with this change so you can see later who changed what and why."><input className={inputClass} value={draft.reason} onChange={(e) => set({ reason: e.target.value })} /></Field>
            {draft.id && (confirmDelete ? (
              <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p>{draft.action === 'brand' ? `Delete “${draft.name}”? Products with this brand keep selling, just without a brand.` : draft.action === 'category' ? `Delete “${draft.name}”? Only empty categories can be deleted.` : `Delete the whole “${draft.name}” list? Only possible when no product version uses its values.`}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40" onClick={async () => { if (await remove(draft.action, draft.id)) { setDraft(null); setConfirmDelete(false); } }}><Trash2 className="h-4 w-4" aria-hidden /> Yes, delete</button>
                  <button type="button" className={smallButton} onClick={() => setConfirmDelete(false)}>Keep it</button>
                </div>
              </div>
            ) : (
              <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:underline" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" aria-hidden /> Delete this {draft.action === 'attribute' ? 'list' : draft.action}</button>
            ))}
          </div>
        )}
      </ActionDrawer>
    </>
  );
}
