'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Globe, Loader2, RotateCcw, Save } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError } from '@/lib/friendly-message';

const INPUT =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200';

/**
 * Website content editor.
 *
 * Every field falls back to the wording the site shipped with, so clearing one
 * restores the original rather than leaving the page blank. `Reset` therefore
 * just empties the box.
 */
export default function WebsiteContentPage() {
  const { addToast } = useToast();
  const [model, setModel] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson('/api/admin/site-content');
      setModel({ groups: data.groups || [], defaults: data.defaults || {} });
      setValues(data.stored || {});
      setActiveGroup((current) => current || data.groups?.[0]?.id || null);
    } catch (error) {
      addToast(friendlyFromError(error, 'load_failed'));
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const group = useMemo(
    () => (model?.groups || []).find((entry) => entry.id === activeGroup) || model?.groups?.[0] || null,
    [model, activeGroup]
  );

  // A field counts as customised only when it differs from the shipped text.
  const customisedCount = useCallback(
    (entry) => entry.fields.filter((field) => String(values[field.key] ?? '').trim() !== '').length,
    [values]
  );

  const save = async () => {
    setSaving(true);
    try {
      const data = await apiJson('/api/admin/site-content', {
        method: 'PUT',
        body: JSON.stringify({ content: values }),
      });
      setValues(data.stored || {});
      addToast('Website updated. Refresh the storefront to see it.');
    } catch (error) {
      addToast(friendlyFromError(error, 'save_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <header className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Globe className="h-6 w-6" /> Website
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Everything the public site says, apart from your products. Blank fields use the original wording.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              target="_blank"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" /> View site
            </Link>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </header>

      <main className="bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[230px_1fr]">
          <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Website sections">
            {(model?.groups || []).map((entry) => {
              const count = customisedCount(entry);
              const isActive = group?.id === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setActiveGroup(entry.id)}
                  className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium lg:shrink ${
                    isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span>{entry.title}</span>
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                      title={`${count} field(s) changed from the original`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {group && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5">
                <h2 className="font-semibold text-gray-900">{group.title}</h2>
                <p className="text-sm text-gray-500">{group.blurb}</p>
              </div>

              <div className="space-y-5">
                {group.fields.map((field) => {
                  const value = values[field.key] ?? '';
                  const fallback = model.defaults[field.key] || '';
                  const customised = String(value).trim() !== '';
                  return (
                    <div key={field.key}>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor={field.key} className="text-sm font-medium text-gray-900">
                          {field.label}
                        </label>
                        {customised && (
                          <button
                            type="button"
                            onClick={() => setValues((current) => ({ ...current, [field.key]: '' }))}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
                          >
                            <RotateCcw className="h-3 w-3" /> Reset to original
                          </button>
                        )}
                      </div>

                      {field.type === 'textarea' ? (
                        <textarea
                          id={field.key}
                          rows={field.key === 'about.story_body' ? 7 : 3}
                          value={value}
                          placeholder={fallback}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                          className={INPUT}
                        />
                      ) : (
                        <input
                          id={field.key}
                          type="text"
                          value={value}
                          placeholder={fallback}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                          className={INPUT}
                        />
                      )}

                      {field.hint && <p className="mt-1 text-xs text-gray-500">{field.hint}</p>}
                      {!customised && (
                        <p className="mt-1 text-xs text-gray-400">Showing the original wording.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
    </AdminLayout>
  );
}
