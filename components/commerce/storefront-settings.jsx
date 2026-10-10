'use client';
import { useEffect, useState } from 'react';
import { Copy, CreditCard, ExternalLink, Globe, KeyRound, Palette, Save, Truck } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import OnlinePublishing from './online-publishing';
import { Field, ImageUploadButton, Notice, Page, PageHeader, Panel, SearchPicker, Toggle, inputClass, primaryButton, secondaryButton, smallButton, textareaClass } from './catalog-ui';

export default function StorefrontSettings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState('');
  useEffect(() => { apiJson('/api/admin/commerce/storefront').then((row) => { setData({ ...row, reason: 'Update online store settings' }); setDirty(false); }).catch((e) => setError(e.error || 'Could not load the online store settings.')); }, []);
  const run = async (fn) => { setBusy(true); setError(''); setMessage(''); try { await fn(); } catch (e) { setError(e.error || e.message || 'Could not save.'); } finally { setBusy(false); } };
  const set = (patch) => { setData((d) => ({ ...d, ...patch })); setDirty(true); };
  const flag = (key) => !!Number(data?.[key]);
  const text = (key, label, hint, area = false) => (
    <Field key={key} label={label} hint={hint}>
      {area ? <textarea rows={3} className={textareaClass} value={data[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} /> : <input className={inputClass} value={data[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} />}
    </Field>
  );

  return (
    <>
      <PageHeader icon={Globe} tone="bg-sky-50 text-sky-600" title="Online store" description="Set up the customer storefront, choose how orders are fulfilled, then publish products."
        actions={<a className={secondaryButton} href="/store" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /> Open online store</a>} />
      <Page>
        <Notice onClose={() => setError('')}>{error}</Notice>
        <Notice tone="success" onClose={() => setMessage('')}>{message}</Notice>
        {data && (
          <>
            <section className={`rounded-2xl border p-5 shadow-sm ${flag('enabled') ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} aria-label="Online ordering status">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-600">Store status</p><h2 className="mt-1 text-xl font-bold text-gray-900">Online orders are {flag('enabled') ? 'on' : 'off'}</h2><p className="mt-1 max-w-xl text-sm text-gray-600">{flag('enabled') ? 'Customers can browse and place orders for the products you publish.' : 'Customers can browse, but cannot order until you turn this on and save.'}</p></div><div className="min-w-64"><Toggle checked={flag('enabled')} onChange={(v) => set({ enabled: v ? 1 : 0 })} label="Accept online orders" /></div></div>
              {dirty && <p role="status" className="mt-3 text-xs font-semibold text-amber-900">You have unsaved store settings.</p>}
            </section>
            <nav className="flex flex-wrap gap-2 text-sm" aria-label="Online store sections"><a className={smallButton} href="#store-look">1. Store look</a><a className={smallButton} href="#store-fulfillment">2. Ordering</a><a className={smallButton} href="#store-payment">3. Payment</a><a className={smallButton} href="#store-products">4. Products</a><a className={smallButton} href="#store-customers">5. Customer access</a></nav>
            <div className="grid gap-5 xl:grid-cols-2">
              <section id="store-look" className="scroll-mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-start gap-3"><Palette className="mt-0.5 h-5 w-5 text-sky-600" aria-hidden /><div><h2 className="font-bold text-gray-900">1. Store look</h2><p className="text-sm text-gray-500">What customers see when they open your store.</p></div></div><div className="space-y-4">
                {text('store_name', 'Store name')}
                <div className="grid grid-cols-[auto_1fr] items-end gap-3"><Field label="Brand colour"><input type="color" value={/^#[0-9a-f]{6}$/i.test(data.brand_color || '') ? data.brand_color : '#20372e'} onChange={(e) => set({ brand_color: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-gray-300 p-1" /></Field><Field label="Colour code"><input className={inputClass} value={data.brand_color ?? ''} onChange={(e) => set({ brand_color: e.target.value })} /></Field></div>
                <div><span className="mb-1.5 block text-sm font-medium text-gray-700">Logo</span><div className="flex items-center gap-3"><div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                  {toPublicImageUrl(data.logo_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={toPublicImageUrl(data.logo_url)} alt="Logo" className="h-full w-full object-contain" />
                  ) : <span className="text-xs text-gray-400">No logo</span>}
                </div><ImageUploadButton label="Upload logo" onUploaded={(url) => set({ logo_url: url })} />{data.logo_url && <button type="button" className={smallButton} onClick={() => set({ logo_url: '' })}>Remove</button>}</div></div>
                {text('hero_text', 'Welcome message', 'Shown at the top of the store.', true)}
                {text('contact_text', 'Contact details', 'Phone, address and opening hours customers may need.', true)}
              </div></section>
              <section id="store-fulfillment" className="scroll-mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-start gap-3"><Truck className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden /><div><h2 className="font-bold text-gray-900">2. Ordering and delivery</h2><p className="text-sm text-gray-500">How customers check out and get their order.</p></div></div><div className="space-y-4">
                <Toggle checked={flag('guest_enabled')} onChange={(v) => set({ guest_enabled: v ? 1 : 0 })} label="Allow guest checkout" description="Customers can order without an account." />
                {text('pickup_instructions', 'Collection instructions', 'Shown after a customer chooses pickup.', true)}
                <Toggle checked={flag('delivery_enabled')} onChange={(v) => set({ delivery_enabled: v ? 1 : 0 })} label="Offer delivery" />
                {flag('delivery_enabled') && <div className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2"><Field label="Delivery fee (Rs)"><input type="number" min="0" className={inputClass} value={data.delivery_fee ?? ''} onChange={(e) => set({ delivery_fee: e.target.value })} /></Field><Field label="Free delivery above (Rs)" hint="Leave blank if delivery is always charged."><input type="number" min="0" className={inputClass} value={data.free_delivery_threshold ?? ''} onChange={(e) => set({ free_delivery_threshold: e.target.value })} /></Field></div>}
                <Field label="Unpaid order hold (minutes)" hint="Stock is released if payment is still pending after this time. Enter 15–1440."><input type="number" min="15" max="1440" className={inputClass} value={data.reservation_minutes ?? ''} onChange={(e) => set({ reservation_minutes: e.target.value })} /></Field>
              </div></section>
              <section id="store-payment" className="scroll-mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2"><div className="mb-5 flex items-start gap-3"><CreditCard className="mt-0.5 h-5 w-5 text-indigo-600" aria-hidden /><div><h2 className="font-bold text-gray-900">3. Payment and returns</h2><p className="text-sm text-gray-500">Instructions shown during checkout and after the order.</p></div></div><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-4"><Toggle checked={flag('manual_payment_enabled')} onChange={(v) => set({ manual_payment_enabled: v ? 1 : 0 })} label="Accept bank transfer / QR payment" description="Confirm the payment before handing over the order." />{flag('manual_payment_enabled') && text('payment_instructions', 'Payment instructions', 'Bank account or QR details shown at checkout.', true)}</div>{text('return_policy', 'Returns and exchanges', 'Explain how customers can request a return.', true)}</div></section>
            </div>
            <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><Field label="Note for the change log" className="min-w-52 flex-1"><input className={inputClass} value={data.reason} onChange={(e) => set({ reason: e.target.value })} /></Field><button type="button" className={primaryButton} disabled={busy || !data.reason.trim()} onClick={() => run(async () => { await apiJson('/api/admin/commerce/storefront', { method: 'POST', body: JSON.stringify(data) }); setDirty(false); setMessage('Online store settings saved.'); })}><Save className="h-4 w-4" aria-hidden />{busy ? 'Saving…' : 'Save store settings'}</button></section>
          </>
        )}
        <section id="store-products" className="scroll-mt-6"><OnlinePublishing /></section>
        <section id="store-customers" className="scroll-mt-6"><Panel title="5. Customer online access" description="Create a one-time setup code for an existing customer after checking their identity. The code is valid for 24 hours; share it with the customer yourself.">
          <div className="space-y-3">
            {customer
              ? <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"><span><span className="font-medium">{customer.title}</span> <span className="text-gray-500">{customer.phone}</span></span><button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => { setCustomer(null); setCode(''); }}>Change</button></div>
              : <SearchPicker group="customers" placeholder="Find customer by name or phone…" onPick={(row) => { setCustomer(row); setCode(''); }} />}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> I checked this person is the customer</label>
            <button type="button" className={primaryButton} disabled={busy || !verified || !customer} onClick={() => run(async () => { const result = await apiJson('/api/admin/commerce/storefront', { method: 'POST', body: JSON.stringify({ action: 'invite', customer_id: customer.id, identity_verified: verified }) }); setCode(result.activation_code); })}><KeyRound className="h-4 w-4" aria-hidden /> Create one-time code</button>
            {code && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <code className="flex-1 break-all text-sm font-bold text-emerald-900">{code}</code>
                <button type="button" className={smallButton} onClick={() => navigator.clipboard?.writeText(code)}><Copy className="h-3.5 w-3.5" aria-hidden /> Copy</button>
              </div>
            )}
          </div>
        </Panel></section>
      </Page>
    </>
  );
}
