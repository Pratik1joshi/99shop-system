'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { BookOpen, Check, Eye, Loader2, Printer, ReceiptText, RotateCcw, Save } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { PRINTER_DEFAULTS, printerSettingsPayload, resolvePrinterSettings, settingEnabled } from '@/lib/printer-settings';
import { creditStatementPage, printCreditStatement, printRetailReceipt, retailReceiptPage } from '@/lib/pos-print';
import { receiptDocument } from '@/lib/print-receipt';

/*
 * Printer & documents: every word and detail on the customer receipt and the
 * credit statement. The preview is the real print output for a sample sale,
 * built by the same functions Billing and the statement screens print with.
 */

const INPUT = 'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100';
const THERMAL = [['80', '80 mm (standard)'], ['58', '58 mm (compact)']];
const SHOP_KEYS = ['shop_name', 'shop_address', 'shop_phone', 'pan_number', 'vat_number'];

const TABS = [
  {
    id: 'receipt', label: 'Customer receipt', icon: ReceiptText,
    hint: 'Printed when a sale is paid in Billing, and for reprints from Sales.',
    groups: [
      { title: 'Paper and title', fields: [
        { key: 'receipt_paper_size', label: 'Paper size', options: THERMAL },
        { key: 'bill_title', label: 'Document title', placeholder: 'RECEIPT' },
        { key: 'bill_number_label', label: 'Receipt number label', placeholder: 'Invoice' },
      ] },
      { title: 'Item columns', fields: [
        { key: 'bill_item_label', label: 'Item column', placeholder: 'Item' },
        { key: 'bill_qty_label', label: 'Quantity column', placeholder: 'Qty' },
        { key: 'bill_qty_position', label: 'Quantity position', options: [['after', 'After the item name'], ['before', 'Before the item name']] },
        { key: 'bill_rate_label', label: 'Rate column', placeholder: 'Rate' },
        { key: 'bill_amount_label', label: 'Amount column', placeholder: 'Amount' },
      ] },
      { title: 'Footer', fields: [{ key: 'bill_footer', label: 'Thank-you message', textarea: true, placeholder: 'Thank you for shopping at 99 Shop!' }] },
    ],
    checks: [
      ['bill_show_shop_name', 'Shop name'], ['bill_show_address', 'Address'], ['bill_show_phone', 'Phone'], ['bill_show_pan', 'PAN number'],
      ['bill_show_vat', 'VAT number'], ['bill_show_not_tax_invoice', '“Not a tax invoice”'], ['bill_show_datetime', 'Date and time'],
      ['bill_show_cashier', 'Cashier'], ['bill_show_customer', 'Customer'], ['bill_show_item_rate', 'Rate column'], ['bill_show_payment', 'Payment and change'],
    ],
  },
  {
    id: 'statement', label: 'Credit statements', icon: BookOpen,
    hint: 'Printed from Receivables and Payables for a customer or supplier account.',
    groups: [
      { title: 'Paper and titles', fields: [
        { key: 'statement_paper_size', label: 'Paper size', options: [['a4', 'A4 full page (recommended)'], ...THERMAL] },
        { key: 'statement_customer_title', label: 'Customer statement title', placeholder: 'CUSTOMER CREDIT STATEMENT' },
        { key: 'statement_supplier_title', label: 'Supplier statement title', placeholder: 'SUPPLIER CREDIT STATEMENT' },
      ] },
      { title: 'Columns', fields: [
        { key: 'statement_date_label', label: 'Date / note column', placeholder: 'Date / Note' },
        { key: 'statement_debit_label', label: 'Debit column', placeholder: 'Debit' },
        { key: 'statement_credit_label', label: 'Credit column', placeholder: 'Credit' },
        { key: 'statement_balance_label', label: 'Balance column', placeholder: 'Balance' },
      ] },
      { title: 'Footer', fields: [{ key: 'statement_footer', label: 'Closing message', textarea: true }] },
    ],
    checks: [
      ['statement_show_address', 'Shop address'], ['statement_show_pan', 'PAN number'], ['statement_show_phone', 'Customer / supplier phone'],
      ['statement_show_not_tax_invoice', '“Not a tax invoice”'], ['statement_show_printed_at', 'Printed date and time'],
    ],
  },
];

const tabKeys = (tab) => [...tab.groups.flatMap((g) => g.fields.map((f) => f.key)), ...tab.checks.map(([key]) => key)];

/** A believable sale for the preview and test print, with the shop's VAT rate. */
function sampleSale(settings) {
  const subtotal = 800;
  const vat = Number(settings.vat_percentage) || 0;
  const tax = Math.round(subtotal * vat) / 100;
  const total = subtotal + tax;
  const paid = Math.ceil(total / 500) * 500;
  return {
    id: 1, sale_number: 'S-000123', completed_at: new Date().toISOString(), cashier_name: 'Cashier', customer_name: 'Sita Sharma',
    lines: [
      { product_name_snapshot: 'Heart Claw Clip', variant_name_snapshot: 'Pink', sku_snapshot: 'CLIP-PNK', quantity: 2, unit_price: 250, net_amount: 500, discount_amount: 0 },
      { product_name_snapshot: 'Cherry Bag Charm', quantity: 1, unit_price: 300, net_amount: 300, discount_amount: 0 },
    ],
    subtotal, discount_amount: 0, tax_amount: tax, grand_total: total, amount_paid: total, amount_due: 0,
    payments: [{ method: 'cash', amount: total, cash_tendered: paid, change_given: paid - total }],
  };
}

function sampleStatement(kind) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    kind, name: kind === 'supplier' ? 'Kathmandu Accessories Pvt. Ltd.' : 'Sita Sharma', phone: '98XXXXXXXX', outstanding: 300,
    lines: [
      { date: today, memo: kind === 'supplier' ? 'Purchase GR-0042' : 'Sale S-000123', debit: 800, credit: 0, balance: 800 },
      { date: today, memo: 'Payment received', debit: 0, credit: 500, balance: 300 },
    ],
  };
}

export default function PrinterSettingsPage() {
  const [settings, setSettings] = useState(PRINTER_DEFAULTS);
  const [saved, setSaved] = useState('');
  const [tabId, setTabId] = useState('receipt');
  const [statementKind, setStatementKind] = useState('customer');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ tone: '', text: '' });
  const set = (patch) => { setSettings((old) => ({ ...old, ...patch })); setMessage({ tone: '', text: '' }); };
  const tab = TABS.find((t) => t.id === tabId);

  const payload = useMemo(() => ({
    ...printerSettingsPayload(settings),
    ...Object.fromEntries(SHOP_KEYS.map((key) => [key, settings[key] ?? ''])),
  }), [settings]);
  const dirty = !loading && JSON.stringify(payload) !== saved;

  useEffect(() => {
    apiJson('/api/admin/settings').then((data) => {
      const loaded = resolvePrinterSettings(data.settings || {});
      setSettings(loaded);
      setSaved(JSON.stringify({ ...printerSettingsPayload(loaded), ...Object.fromEntries(SHOP_KEYS.map((key) => [key, loaded[key] ?? ''])) }));
    }).catch((error) => setMessage({ tone: 'error', text: error.error || error.message || 'Could not load printer settings.' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true); setMessage({ tone: '', text: '' });
    try {
      await apiJson('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setSaved(JSON.stringify(payload));
      setMessage({ tone: 'success', text: 'Saved. Every receipt and statement printed from now on uses these templates.' });
    } catch (error) { setMessage({ tone: 'error', text: error.error || error.message || 'Could not save printer settings.' }); }
    finally { setSaving(false); }
  };

  const resetTab = () => set(Object.fromEntries(tabKeys(tab).map((key) => [key, PRINTER_DEFAULTS[key]])));

  const page = tabId === 'receipt'
    ? retailReceiptPage(sampleSale(settings), { size: settings.receipt_paper_size || '80', settings })
    : creditStatementPage(sampleStatement(statementKind), { settings });
  const printTest = () => {
    const opened = tabId === 'receipt'
      ? printRetailReceipt(sampleSale(settings), { size: settings.receipt_paper_size || '80', settings })
      : printCreditStatement(sampleStatement(statementKind), { settings });
    if (!opened) setMessage({ tone: 'error', text: 'The browser blocked the print window. Allow pop-ups for this site and try again.' });
  };

  if (loading) return <AdminLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-400" aria-label="Loading printer settings" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <header className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Printer className="h-6 w-6 text-pink-600" aria-hidden /> Printer &amp; documents</h1>
            <p className="mt-1 text-sm text-gray-500">Change what your printed receipts and statements say. The preview updates as you type.</p>
          </div>
          <div className="flex items-center gap-3">
            {dirty && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Unsaved changes</span>}
            <button type="button" onClick={save} disabled={saving || !dirty} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}{saving ? 'Saving…' : 'Save all templates'}
            </button>
          </div>
        </div>
        {message.text && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mx-auto mt-3 max-w-7xl rounded-lg px-3 py-2 text-sm ${message.tone === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{message.text}</p>}
        <nav aria-label="Documents" className="mx-auto mt-4 flex max-w-7xl gap-2 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={tabId === id} onClick={() => setTabId(id)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${tabId === id ? 'bg-pink-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-pink-50'}`}>
              <Icon className="h-4 w-4" aria-hidden />{label}
            </button>
          ))}
        </nav>
      </header>

      <main className="bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">{tab.hint}</p>
              <button type="button" onClick={resetTab} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900"><RotateCcw className="h-3.5 w-3.5" aria-hidden />Reset this document</button>
            </div>

            {tab.groups.map((group) => (
              <Card key={group.title} title={group.title}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.fields.map((field) => <FieldInput key={field.key} field={field} value={settings[field.key]} onChange={(value) => set({ [field.key]: value })} />)}
                </div>
              </Card>
            ))}

            <Card title={tabId === 'receipt' ? 'Show on the receipt' : 'Show on the statement'} hint="Tap to turn each detail on or off.">
              <div className="flex flex-wrap gap-2">
                {tab.checks.map(([key, label]) => {
                  const active = settingEnabled(settings[key], PRINTER_DEFAULTS[key]);
                  return (
                    <button key={key} type="button" aria-pressed={active} onClick={() => set({ [key]: !active })}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition ${active ? 'border-pink-300 bg-pink-50 text-pink-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                      <span className={`grid h-4 w-4 place-items-center rounded-full ${active ? 'bg-pink-600 text-white' : 'border border-gray-300'}`}>{active && <Check className="h-3 w-3" aria-hidden />}</span>{label}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card title="Shop details at the top" hint="Also on Settings › Business. Changing them here changes them everywhere.">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldInput field={{ key: 'shop_name', label: 'Shop name' }} value={settings.shop_name} onChange={(value) => set({ shop_name: value })} />
                <FieldInput field={{ key: 'shop_phone', label: 'Phone' }} value={settings.shop_phone} onChange={(value) => set({ shop_phone: value })} />
                <FieldInput field={{ key: 'shop_address', label: 'Address' }} value={settings.shop_address} onChange={(value) => set({ shop_address: value })} />
                <FieldInput field={{ key: 'pan_number', label: 'PAN number' }} value={settings.pan_number} onChange={(value) => set({ pan_number: value })} />
                <FieldInput field={{ key: 'vat_number', label: 'VAT number' }} value={settings.vat_number} onChange={(value) => set({ vat_number: value })} />
              </div>
            </Card>
          </div>

          <aside aria-label="Live preview" className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500"><Eye className="h-4 w-4" aria-hidden />Live preview</p>
                {tabId === 'statement' && (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-0.5" role="group" aria-label="Statement for">
                    {[['customer', 'Customer'], ['supplier', 'Supplier']].map(([id, label]) => <button key={id} type="button" aria-pressed={statementKind === id} onClick={() => setStatementKind(id)} className={`h-7 rounded-md px-2.5 text-xs font-bold ${statementKind === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>{label}</button>)}
                  </div>
                )}
              </div>
              <PrintPreview page={page} />
              <button type="button" onClick={printTest} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50">
                <Printer className="h-4 w-4" aria-hidden />Print test
              </button>
              <p className="mt-2 text-center text-xs text-gray-500">Prints this sample with what is on screen, saved or not.</p>
            </div>
          </aside>
        </div>
      </main>
    </AdminLayout>
  );
}

function Card({ title, hint, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FieldInput({ field, value, onChange }) {
  const id = `printer-${field.key}`;
  return (
    <label htmlFor={id} className={`text-sm font-medium text-gray-700 ${field.textarea ? 'sm:col-span-2' : ''}`}>
      {field.label}
      {field.options
        ? <select id={id} className={`${INPUT} mt-1.5`} value={value || field.options[0][0]} onChange={(e) => onChange(e.target.value)}>{field.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        : field.textarea
          ? <textarea id={id} rows={2} maxLength={300} className={`${INPUT} mt-1.5 h-auto py-2`} value={value || ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
          : <input id={id} maxLength={80} className={`${INPUT} mt-1.5`} value={value || ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

/** The real printed page in a frame, sized like the paper it will come out on. */
function PrintPreview({ page }) {
  const frame = useRef(null);
  const [height, setHeight] = useState(480);
  const html = receiptDocument(page);
  // A4 is drawn at full width and shrunk to fit beside the form.
  const a4 = page.size === 'a4';
  const width = page.size === '58' ? 240 : a4 ? 794 : 320;
  const fit = () => {
    try { setHeight(Math.max(240, frame.current.contentDocument.documentElement.scrollHeight + 8)); } catch { /* keep the last height */ }
  };
  useEffect(fit, [html]);
  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl bg-gray-200 p-4">
      <iframe ref={frame} title="Print preview" srcDoc={html} onLoad={fit} sandbox="allow-same-origin"
        style={{ width, height, zoom: a4 ? 0.5 : 1 }} className="mx-auto block rounded bg-white shadow" />
    </div>
  );
}
