'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { Printer, Save, Loader2, ReceiptText, BookOpen, Eye } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { PRINTER_DEFAULTS, printerSettingsPayload, resolvePrinterSettings, settingEnabled, qtyAfterItem } from '@/lib/printer-settings';
import { formatCalendarDate, formatCalendarDateTime } from '@/lib/calendar-system.js';

const INPUT = 'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none';
const PAPER_OPTIONS = [['80','80mm standard'],['58','58mm compact']];
const QTY_POSITION = [['after','After item name'],['before','Before item name']];
const BILL_CHECKS = [['bill_show_shop_name','Shop name'],['bill_show_not_tax_invoice','“Not a tax invoice”'],['bill_show_pan','PAN number'],['bill_show_vat','VAT number'],['bill_show_address','Address'],['bill_show_phone','Phone'],['bill_show_customer','Customer'],['bill_show_table','Sale type'],['bill_show_order','Order number'],['bill_show_datetime','Date and time'],['bill_show_cashier','Cashier'],['bill_show_payment','Payment details'],['bill_show_item_rate','Item rate column']];
const STATEMENT_CHECKS = [['statement_show_not_tax_invoice','“Not a tax invoice”'],['statement_show_pan','PAN number'],['statement_show_address','Address'],['statement_show_phone','Party phone'],['statement_show_printed_at','Printed date and time']];

export default function PrinterSettingsPage() {
  const [settings, setSettings] = useState(PRINTER_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ tone: '', text: '' });
  const set = (patch) => setSettings((old) => ({ ...old, ...patch }));

  useEffect(() => {
    apiJson('/api/admin/settings').then((data) => setSettings(resolvePrinterSettings(data.settings || {})))
      .catch((error) => setMessage({ tone: 'error', text: error.message || 'Could not load printer settings.' }))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setMessage({ tone: '', text: '' });
    try {
      await apiJson('/api/admin/settings', { method: 'PUT', body: JSON.stringify(printerSettingsPayload(settings)) });
      setMessage({ tone: 'success', text: 'Printer templates saved. New prints will use these settings.' });
    } catch (error) { setMessage({ tone: 'error', text: error.message || 'Could not save printer settings.' }); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div></AdminLayout>;
  return <AdminLayout>
    <header className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 lg:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Printer className="h-6 w-6" /> Printer</h1><p className="mt-1 text-sm text-gray-500">Edit every customer-facing label and instantly see how the printed document will look.</p></div><button onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save templates'}</button></div>{message.text && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.tone === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{message.text}</p>}</header>
    <main className="space-y-5 bg-gray-50 p-4 sm:p-6 lg:p-8">
      <Section icon={ReceiptText} title="Customer bills" hint="Thermal bill wording, columns, business information and transaction details.">
        <Grid><Select label="Paper size" value={settings.receipt_paper_size} onChange={(v) => set({ receipt_paper_size: v })} options={PAPER_OPTIONS} /><Text label="Document title" value={settings.bill_title} onChange={(v) => set({ bill_title: v })} /><Text label="Bill number label" value={settings.bill_number_label} onChange={(v) => set({ bill_number_label: v })} /><Text label="Order number label" value={settings.bill_order_label} onChange={(v) => set({ bill_order_label: v })} /><Text label="Quantity column" value={settings.bill_qty_label} onChange={(v) => set({ bill_qty_label: v })} /><Text label="Item column" value={settings.bill_item_label} onChange={(v) => set({ bill_item_label: v })} /><Select label="Quantity position" value={settings.bill_qty_position || 'after'} onChange={(v) => set({ bill_qty_position: v })} options={QTY_POSITION} /><Text label="Rate column" value={settings.bill_rate_label} onChange={(v) => set({ bill_rate_label: v })} /><Text label="Amount column" value={settings.bill_amount_label} onChange={(v) => set({ bill_amount_label: v })} /><Text label="Footer message" value={settings.bill_footer} onChange={(v) => set({ bill_footer: v })} /></Grid><Checks settings={settings} set={set} fields={BILL_CHECKS} /><LivePreview kind="bill" settings={settings} />
      </Section>
      <Section icon={BookOpen} title="Credit statements" hint="Full A4 statements are recommended; thermal sizes remain available.">
        <Grid><Select label="Statement page" value={settings.statement_paper_size} onChange={(v) => set({ statement_paper_size: v })} options={[['a4','A4 full page (recommended)'], ...PAPER_OPTIONS]} /><Text label="Customer statement title" value={settings.statement_customer_title} onChange={(v) => set({ statement_customer_title: v })} /><Text label="Supplier statement title" value={settings.statement_supplier_title} onChange={(v) => set({ statement_supplier_title: v })} /><Text label="Date / note column" value={settings.statement_date_label} onChange={(v) => set({ statement_date_label: v })} /><Text label="Debit column" value={settings.statement_debit_label} onChange={(v) => set({ statement_debit_label: v })} /><Text label="Credit column" value={settings.statement_credit_label} onChange={(v) => set({ statement_credit_label: v })} /><Text label="Balance column" value={settings.statement_balance_label} onChange={(v) => set({ statement_balance_label: v })} /><Text label="Statement footer" value={settings.statement_footer} onChange={(v) => set({ statement_footer: v })} /></Grid><Checks settings={settings} set={set} fields={STATEMENT_CHECKS} /><LivePreview kind="statement" settings={settings} />
      </Section>
    </main>
  </AdminLayout>;
}

function Section({ icon: Icon, title, hint, children }) { return <section className="mx-auto max-w-6xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-4 flex gap-3"><Icon className="mt-0.5 h-5 w-5 text-gray-600" /><div><h2 className="font-semibold text-gray-900">{title}</h2><p className="text-sm text-gray-500">{hint}</p></div></div><div className="space-y-4">{children}</div></section>; }
function Grid({ children }) { return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>; }
function Text({ label, value, onChange }) { return <label className="text-sm font-medium text-gray-700">{label}<input className={`${INPUT} mt-1.5`} value={value || ''} onChange={(e) => onChange(e.target.value)} /></label>; }
function Select({ label, value, onChange, options }) { return <label className="text-sm font-medium text-gray-700">{label}<select className={`${INPUT} mt-1.5`} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
function Checks({ settings, set, fields }) { return <div className="flex flex-wrap gap-3">{fields.map(([key,label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"><input type="checkbox" checked={settingEnabled(settings[key], PRINTER_DEFAULTS[key])} onChange={(e) => set({ [key]: e.target.checked })} className="h-4 w-4" />{label}</label>)}</div>; }
function LivePreview({ kind, settings }) { return <div className="rounded-xl border border-dashed border-gray-300 bg-slate-100 p-4"><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500"><Eye className="h-4 w-4" /> Live preview</p><div className="overflow-auto rounded-lg bg-gray-200 p-4">{kind === 'bill' ? <BillPreview s={settings} /> : <StatementPreview s={settings} />}</div></div>; }
const on = (s, key) => settingEnabled(s[key], PRINTER_DEFAULTS[key]);
const Meta = ({ label, value }) => <div className="flex justify-between gap-3"><span>{label}</span><b>{value}</b></div>;

function BillPreview({ s }) {
  const rate = on(s, 'bill_show_item_rate');
  const after = qtyAfterItem(s.bill_qty_position);
  const cols = after
    ? (rate ? 'grid-cols-[1fr_36px_55px_65px]' : 'grid-cols-[1fr_36px_65px]')
    : (rate ? 'grid-cols-[30px_1fr_55px_65px]' : 'grid-cols-[30px_1fr_65px]');
  const head = after
    ? <><span>{s.bill_item_label}</span><span className="text-center">{s.bill_qty_label}</span></>
    : <><span className="text-center">{s.bill_qty_label}</span><span>{s.bill_item_label}</span></>;
  const line = (qty, name, unit, total) => after
    ? <><span>{name}</span><span className="text-center">{qty}</span>{rate && <span className="text-right">{unit}</span>}<span className="text-right">{total}</span></>
    : <><span className="text-center">{qty}</span><span>{name}</span>{rate && <span className="text-right">{unit}</span>}<span className="text-right">{total}</span></>;
  return <div style={{ width: s.receipt_paper_size === '58' ? 250 : 330 }} className="mx-auto bg-white px-5 py-6 font-mono text-[11px] leading-4 text-black shadow"><div className="text-center">{on(s,'bill_show_shop_name') && <h3 className="text-base font-black">{(s.shop_name || '99 SHOP BY SHAHANA').toUpperCase()}</h3>}{on(s,'bill_show_address') && <p>{s.shop_address || 'Birendranagar, Surkhet'}</p>}<p>{on(s,'bill_show_phone') ? (s.shop_phone || '98XXXXXXXX') : ''}{on(s,'bill_show_pan') ? ` · PAN: ${s.pan_number || '123456789'}` : ''}</p></div><div className="my-3 border-y border-black py-1 text-center"><b>{s.bill_title}</b>{on(s,'bill_show_not_tax_invoice') && <div className="text-[9px]">NOT A TAX INVOICE</div>}</div><Meta label={s.bill_number_label} value="T-058" />{on(s,'bill_show_table') && <Meta label="Sale type" value="Counter" />}{on(s,'bill_show_order') && <Meta label={s.bill_order_label} value="D-058" />}{on(s,'bill_show_datetime') && <Meta label="Date / Time" value={formatCalendarDateTime('2026-08-31T03:16:00+05:45')} />}{on(s,'bill_show_cashier') && <Meta label="Cashier" value="Shop Admin" />}{on(s,'bill_show_customer') && <Meta label="Customer" value="Pratik Joshi" />}<div className={`mt-3 grid border-y border-black py-1 font-bold ${cols}`}>{head}{rate && <span className="text-right">{s.bill_rate_label}</span>}<span className="text-right">{s.bill_amount_label}</span></div><div className={`grid py-2 ${cols}`}>{line('2', 'Heart Crown Claw Clip', '250.00', '500.00')}{line('1', 'Cherry Bag Charm', '300.00', '300.00')}</div><Meta label="Subtotal" value="800.00" /><div className="my-2 flex justify-between border-y-2 border-black py-1 text-sm font-black"><span>TOTAL</span><span>Rs. 800.00</span></div>{on(s,'bill_show_payment') && <Meta label="Payment" value="Cash" />}<p className="mt-4 text-center font-bold">{s.bill_footer}</p></div>;
}

function StatementPreview({ s }) { const thermal = s.statement_paper_size !== 'a4'; return <div className={`mx-auto bg-white p-6 text-[11px] text-black shadow ${thermal ? (s.statement_paper_size === '58' ? 'w-[250px]' : 'w-[330px]') : 'w-full max-w-[760px] min-h-[480px]'}`}><div className="text-center"><h3 className="text-lg font-black">{s.shop_name || '99 Shop by Shahana'}</h3>{on(s,'statement_show_address') && <p>{s.shop_address || 'Birendranagar, Surkhet'}</p>}{on(s,'statement_show_pan') && <p>PAN: {s.pan_number || '123456789'}</p>}</div><div className="my-4 border-y border-black py-2 text-center"><b>{s.statement_customer_title}</b>{on(s,'statement_show_not_tax_invoice') && <p className="text-[9px]">NOT A TAX INVOICE</p>}</div><Meta label="Customer" value="Pratik Joshi" />{on(s,'statement_show_phone') && <Meta label="Phone" value="98XXXXXXXX" />}{on(s,'statement_show_printed_at') && <Meta label="Printed" value={formatCalendarDateTime('2026-08-31T03:16:00+05:45')} />}<div className="mt-4 grid grid-cols-[1.5fr_repeat(3,1fr)] border-y border-black py-2 font-bold"><span>{s.statement_date_label}</span><span className="text-right">{s.statement_debit_label}</span><span className="text-right">{s.statement_credit_label}</span><span className="text-right">{s.statement_balance_label}</span></div><div className="grid grid-cols-[1.5fr_repeat(3,1fr)] py-2"><span>{formatCalendarDate('2026-08-31')}<br/>Bill T-058</span><span className="text-right">1,000.00</span><span className="text-right">—</span><span className="text-right">1,000.00</span><span>{formatCalendarDate('2026-08-31')}<br/>Payment</span><span className="text-right">—</span><span className="text-right">980.00</span><span className="text-right">20.00</span></div><div className="mt-2 flex justify-between border-y-2 border-black py-2 text-sm font-black"><span>Outstanding</span><span>Rs. 20.00</span></div><p className="mt-5 text-center font-semibold">{s.statement_footer}</p></div>; }

