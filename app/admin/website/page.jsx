'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Globe, Loader2, Monitor, RefreshCw, RotateCcw, Save, Smartphone, Tablet } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { ImageUploadButton, Notice, PageHeader, inputClass, primaryButton, secondaryButton, smallButton, textareaClass } from '@/components/commerce/catalog-ui';

// Which public page shows each section, so the preview follows the editor.
const PREVIEW_PATH = { shop: '/', contact: '/about#contact', home: '/', steps: '/#order', about: '/about#story', footer: '/#footer' };
const DEVICE_WIDTH = { desktop: 1280, tablet: 768, phone: 390 };

function ResponsiveSitePreview({ path, device, previewKey }) {
  const containerRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const update = () => {
      const style = getComputedStyle(element);
      setAvailableWidth(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width = DEVICE_WIDTH[device];
  const height = 760;
  const scale = availableWidth ? Math.min(1, availableWidth / width) : 1;
  return (
    <div ref={containerRef} className="min-w-0 overflow-hidden bg-gray-100 p-3 sm:p-5">
      <div className="mx-auto" style={{ width: width * scale, height: height * scale }}>
        <iframe key={`${path}-${previewKey}`} title={`${device} website preview`} src={path}
          className="origin-top-left rounded-xl border border-gray-200 bg-white shadow-sm"
          style={{ width, height, transform: `scale(${scale})` }} />
      </div>
    </div>
  );
}

/**
 * Website content editor with a live preview.
 *
 * Every field falls back to the wording the site shipped with, so clearing one
 * restores the original rather than leaving the page blank.
 */
export default function WebsiteContentPage() {
  const [model, setModel] = useState(null);
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeGroup, setActiveGroup] = useState(null);
  const [device, setDevice] = useState('desktop');
  const [previewKey, setPreviewKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson('/api/admin/site-content');
      setModel({ groups: data.groups || [], defaults: data.defaults || {}, previewCategoryPath: data.previewCategoryPath || null });
      setValues(data.stored || {});
      setSaved(data.stored || {});
      setActiveGroup((current) => current || data.groups?.[0]?.id || null);
    } catch (e) {
      setError(e.error || 'Could not load the website content.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const group = useMemo(() => (model?.groups || []).find((entry) => entry.id === activeGroup) || model?.groups?.[0] || null, [model, activeGroup]);
  const norm = (v) => String(v ?? '').trim();
  const dirtyKeys = useMemo(() => [...new Set([...Object.keys(values), ...Object.keys(saved)])].filter((key) => norm(values[key]) !== norm(saved[key])), [values, saved]);
  const dirty = dirtyKeys.length > 0;
  const customisedCount = (entry) => entry.fields.filter((field) => norm(values[field.key]) !== '').length;
  const setField = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const data = await apiJson('/api/admin/site-content', { method: 'PUT', body: JSON.stringify({ content: Object.fromEntries(dirtyKeys.map((key) => [key, values[key] ?? ''])) }) });
      setValues(data.stored || {});
      setSaved(data.stored || {});
      setPreviewKey((k) => k + 1);
      setMessage('Website updated. The preview shows the live page.');
    } catch (e) {
      setError(e.error || 'Could not save the website content.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div></AdminLayout>;

  const previewPath = group?.id === 'category' ? model?.previewCategoryPath : PREVIEW_PATH[group?.id] || '/';
  const previewName = group?.id === 'category' ? 'Category' : group?.title || 'Home';
  return (
    <AdminLayout>
      <PageHeader icon={Globe} tone="bg-sky-50 text-sky-600" title="Website" description="Everything your public website says, apart from the products. Blank fields use the original wording."
        actions={<>
          {dirty && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}</span>}
          <a href="/" target="_blank" rel="noreferrer" className={secondaryButton}><ExternalLink className="h-4 w-4" aria-hidden /> View site</a>
          <button type="button" onClick={save} disabled={saving || !dirty} className={primaryButton}><Save className="h-4 w-4" aria-hidden />{saving ? 'Saving…' : 'Save changes'}</button>
        </>} />

      <main className="space-y-4 bg-gray-50 p-4 sm:p-6 lg:p-8">
        <Notice onClose={() => setError('')}>{error}</Notice>
        <Notice tone="success" onClose={() => setMessage('')}>{message}</Notice>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <nav className="flex gap-2 overflow-x-auto lg:col-span-2" aria-label="Website sections">
            {(model?.groups || []).map((entry) => {
              const count = customisedCount(entry);
              const isActive = group?.id === entry.id;
              const unsaved = entry.fields.some((field) => dirtyKeys.includes(field.key));
              return (
                <button key={entry.id} type="button" onClick={() => setActiveGroup(entry.id)} aria-current={isActive ? 'true' : undefined}
                  className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <span>{entry.title}{unsaved && <span className="ml-1 text-amber-500" title="Unsaved changes">●</span>}</span>
                  {count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`} title={`${count} field(s) changed from the original`}>{count}</span>}
                </button>
              );
            })}
          </nav>

          {group && (
            <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5">
                <h2 className="font-semibold text-gray-900">{group.title}</h2>
                <p className="text-sm text-gray-500">{group.blurb}</p>
              </div>
              <div className="space-y-5">
                {group.fields.map((field) => {
                  const value = values[field.key] ?? '';
                  const fallback = model.defaults[field.key] || '';
                  const customised = norm(value) !== '';
                  return (
                    <div key={field.key}>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor={field.key} className="text-sm font-medium text-gray-900">{field.label}</label>
                        {customised && <button type="button" onClick={() => setField(field.key, '')} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"><RotateCcw className="h-3 w-3" aria-hidden /> Use original</button>}
                      </div>
                      {field.type === 'image' ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={toPublicImageUrl(customised ? value : fallback)} alt={field.label} className="h-full w-full object-cover" />
                          </div>
                          <ImageUploadButton label={customised ? 'Replace' : 'Upload new'} onUploaded={(url) => setField(field.key, url)} />
                          <input id={field.key} className={`${inputClass} min-w-56 flex-1`} value={value} placeholder={fallback} onChange={(e) => setField(field.key, e.target.value)} aria-label={`${field.label} link`} />
                        </div>
                      ) : field.type === 'textarea' ? (
                        <textarea id={field.key} rows={field.key === 'about.story_body' ? 7 : 3} value={value} placeholder={fallback} onChange={(e) => setField(field.key, e.target.value)} className={textareaClass} />
                      ) : (
                        <input id={field.key} type="text" value={value} placeholder={fallback} onChange={(e) => setField(field.key, e.target.value)} className={inputClass} />
                      )}
                      {field.hint && <p className="mt-1 text-xs text-gray-500">{field.hint}</p>}
                      {!customised && <p className="mt-1 text-xs text-gray-400">Showing the original.</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-label="Live preview" className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{previewName} preview</h2>
                <p className="text-xs text-gray-500">The real public site, showing saved changes at the selected screen width.</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-pressed={device === 'desktop'} aria-label="Desktop preview" onClick={() => setDevice('desktop')} className={`${smallButton} ${device === 'desktop' ? 'bg-gray-100' : ''}`}><Monitor className="h-3.5 w-3.5" aria-hidden /></button>
                <button type="button" aria-pressed={device === 'tablet'} aria-label="Tablet preview" onClick={() => setDevice('tablet')} className={`${smallButton} ${device === 'tablet' ? 'bg-gray-100' : ''}`}><Tablet className="h-3.5 w-3.5" aria-hidden /></button>
                <button type="button" aria-pressed={device === 'phone'} aria-label="Phone preview" onClick={() => setDevice('phone')} className={`${smallButton} ${device === 'phone' ? 'bg-gray-100' : ''}`}><Smartphone className="h-3.5 w-3.5" aria-hidden /></button>
                <button type="button" aria-label="Reload preview" onClick={() => setPreviewKey((k) => k + 1)} className={smallButton}><RefreshCw className="h-3.5 w-3.5" aria-hidden /></button>
                {previewPath && <a href={previewPath} target="_blank" rel="noreferrer" aria-label="Open preview in new tab" className={smallButton}><ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
              </div>
            </div>
            {previewPath ? <ResponsiveSitePreview path={previewPath} device={device} previewKey={previewKey} /> : <div className="p-8 text-center text-sm text-gray-500">Publish a category with a product to preview a category page.</div>}
            {dirty && <p className="border-t border-gray-100 px-4 py-2 text-xs text-amber-700">Save to see your latest changes here.</p>}
          </section>
        </div>
      </main>
    </AdminLayout>
  );
}
