/**
 * Thermal print layouts: the retail sale receipt and the customer/supplier
 * credit statement. Paper size handling (58/80mm, A4) comes from the shared
 * print window in lib/print-receipt.js.
 *
 * Silent printing is NOT claimed — a normal browser opens the print dialog.
 */

import { openReceiptPrint, formatReceiptMoney } from '@/lib/print-receipt.js';
import { formatNepalTime, formatNepalDate, formatNepalClock } from '@/lib/time-utils.js';
import { resolvePrinterSettings, settingEnabled, qtyAfterItem } from '@/lib/printer-settings.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fmtTime(iso) {
  return formatNepalTime(iso || new Date());
}

const SHOP_NAME_FALLBACK = '99 Shop by Shahana';

function money(n) {
  return formatReceiptMoney(n);
}

function totalsBlock({ subtotal, discount, discount_label, tax, grand_total }) {
  return `
    <div class="r-totals">
      <div class="r-row"><span>Subtotal</span><span class="r-num">${money(subtotal)}</span></div>
      ${Number(discount) > 0 ? `<div class="r-row"><span>${esc(discount_label || 'Discount')}</span><span class="r-num">-${money(discount)}</span></div>` : ''}
      ${Number(tax) > 0 ? `<div class="r-row"><span>VAT</span><span class="r-num">${money(tax)}</span></div>` : ''}
    </div>
    <div class="r-grand"><span>TOTAL</span><span class="r-num">${formatReceiptMoney(grand_total, { prefix: true })}</span></div>`;
}

/** Shop header — only prints configured lines, never empty labels. */
function headerBlock(receipt, settings = {}) {
  const p = resolvePrinterSettings(settings);
  const lines = [
    settingEnabled(p.bill_show_address) ? receipt.shop_address : '',
    [settingEnabled(p.bill_show_phone) ? receipt.shop_phone : '', settingEnabled(p.bill_show_pan) && receipt.pan_number ? `PAN: ${receipt.pan_number}` : '', settingEnabled(p.bill_show_vat) && receipt.vat_number ? `VAT: ${receipt.vat_number}` : '']
      .filter(Boolean).join(' · '),
  ].filter(Boolean);
  return `
    <div class="r-head">
      ${settingEnabled(p.bill_show_shop_name) ? `<div class="r-name">${esc((receipt.shop_name || SHOP_NAME_FALLBACK).toUpperCase())}</div>` : ''}
      ${lines.map((l) => `<span class="r-sm">${esc(l)}</span>`).join('')}
    </div>`;
}

/** Document-type banner. Never claims TAX INVOICE — this system only issues receipts. */
function doctypeBlock(mainLabel, tags = []) {
  const tag = tags.filter(Boolean).join(' · ');
  return `<div class="r-doctype"><div class="r-b">${esc(mainLabel)}</div>${tag ? `<div class="r-tag">${esc(tag)}</div>` : ''}</div>`;
}

function metaRow(label, value) {
  return `<div class="r-meta-row"><span class="l">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;
}
function metaFull(label, value) {
  return `<div class="r-meta-full"><span>${esc(label)}: </span><span class="r-b">${esc(value)}</span></div>`;
}

const payLabel = (m) => ({ cash: 'Cash', credit: 'Credit' }[m] || 'Online');

function footerBlock(receipt, { settings = {} } = {}) {
  const p = resolvePrinterSettings(settings);
  const custom = receipt.receipt_footer && receipt.receipt_footer.trim();
  const thanks = custom || p.bill_footer || 'Thank you for shopping at 99 Shop!';
  return `<div class="r-foot"><div class="r-thanks">${esc(thanks)}</div><span class="r-xs">${esc(fmtTime())}</span></div>`;
}

/**
 * Credit statement for a customer (accounts receivable) or supplier (accounts
 * payable) — the running ledger, not a single sale. Same thermal-receipt
 * infrastructure as everything else so it comes off the same printer.
 * @param {{ kind: 'customer'|'supplier', name: string, phone?: string, outstanding: number, lines: Array<{date:string,memo:string,debit:number,credit:number,balance:number}> }} statement
 */
export function printCreditStatement(statement, { size = '80', settings = {} } = {}) {
  const p = resolvePrinterSettings(settings);
  const statementSize = p.statement_paper_size || size || 'a4';
  const { kind, name, phone, outstanding, lines = [], mode = 'full' } = statement;
  const dueOnly = mode === 'due';
  const rows = lines.map((l) => dueOnly ? `
    <tr>
      <td class="c-name" style="width:62%">${esc(formatNepalDate(l.date))}<div class="r-mod">${esc(l.memo || '')}</div></td>
      <td class="c-total" style="width:38%">${money(Number(l.due ?? l.balance ?? 0))}</td>
    </tr>` : `
    <tr>
      <td class="c-name" style="width:34%">${esc(formatNepalDate(l.date))}<div class="r-mod">${esc(l.memo || '')}</div></td>
      <td class="c-price" style="width:22%">${Number(l.debit) > 0 ? money(l.debit) : ''}</td>
      <td class="c-price" style="width:22%">${Number(l.credit) > 0 ? money(l.credit) : ''}</td>
      <td class="c-total" style="width:22%">${money(l.balance)}</td>
    </tr>`).join('');

  const body = `
    ${headerBlock({
      shop_name: settings.shop_name || SHOP_NAME_FALLBACK,
      shop_address: settings.shop_address,
      shop_phone: settings.shop_phone,
      vat_number: settings.vat_number,
      pan_number: settings.pan_number,
    }, { ...p, bill_show_pan: p.statement_show_pan, bill_show_address: p.statement_show_address })}
    ${doctypeBlock(kind === 'supplier' ? p.statement_supplier_title : p.statement_customer_title, [
      ...(dueOnly ? ['AMOUNT DUE ONLY'] : []),
      ...(settingEnabled(p.statement_show_not_tax_invoice) ? ['NOT A TAX INVOICE'] : []),
    ])}
    <div class="r-meta">
      ${metaFull(kind === 'supplier' ? 'Supplier' : 'Customer', name || '—')}
      ${settingEnabled(p.statement_show_phone) && phone ? metaRow('Phone', phone) : ''}
      ${settingEnabled(p.statement_show_printed_at) ? `<div class="r-meta-row"><span class="l">Printed</span><span class="v">${esc(formatNepalDate())} ${esc(formatNepalClock())}</span></div>` : ''}
    </div>
    <div class="r-hr"></div>
    ${lines.length ? `<table><thead><tr>
        ${dueOnly
          ? `<th class="c-name" style="width:62%">${esc(p.statement_date_label)}</th>
             <th class="c-total" style="width:38%">Amount due</th>`
          : `<th class="c-name" style="width:34%">${esc(p.statement_date_label)}</th>
             <th class="c-price" style="width:22%">${esc(p.statement_debit_label)}</th>
             <th class="c-price" style="width:22%">${esc(p.statement_credit_label)}</th>
             <th class="c-total" style="width:22%">${esc(p.statement_balance_label)}</th>`}
      </tr></thead><tbody>${rows}</tbody></table>` : `<p class="r-sm" style="text-align:center;padding:4mm 0;">${dueOnly ? 'Nothing currently due.' : 'No transactions in this range.'}</p>`}
    <div class="r-grand"><span>${outstanding < 0 ? 'Credit balance' : 'Outstanding'}</span><span class="r-num">${money(Math.abs(outstanding))}</span></div>
    ${footerBlock({ receipt_footer: p.statement_footer }, { settings: p })}`;
  return openReceiptPrint({ title: `${kind === 'supplier' ? 'Supplier' : 'Customer'} statement — ${name || ''}`, size: statementSize, body });
}

/* ------------------------------------------------------- retail sale receipt */

function retailItemsTable(lines, settings = {}) {
  const p = resolvePrinterSettings(settings);
  const showRate = settingEnabled(p.bill_show_item_rate);
  const after = qtyAfterItem(p.bill_qty_position);
  const rows = (lines || []).map((l) => {
    const name = `<td class="c-name">${esc(l.product_name_snapshot)}</td>`;
    const qty = `<td class="c-qty r-num">${esc(l.quantity)}</td>`;
    const rate = showRate ? `<td class="c-price r-num">${money(l.unit_price)}</td>` : '';
    const amount = `<td class="c-total r-num">${money(l.net_amount)}</td>`;
    const lead = after ? `${name}${qty}` : `${qty}${name}`;
    const sub = [l.variant_name_snapshot, l.sku_snapshot ? `SKU ${l.sku_snapshot}` : null].filter(Boolean).join(' · ');
    const subRow = sub
      ? `<tr class="r-item-sub"><td class="c-name r-mod">• ${esc(sub)}</td><td colspan="${(showRate ? 2 : 1) + 1}"></td></tr>`
      : '';
    const discRow = Number(l.discount_amount) > 0
      ? `<tr class="r-item-sub"><td class="c-name r-mod">Discount</td><td colspan="${(showRate ? 2 : 1)}"></td><td class="c-total r-num r-mod">-${money(l.discount_amount)}</td></tr>`
      : '';
    return `<tr>${lead}${rate}${amount}</tr>${subRow}${discRow}`;
  }).join('');
  const nameHead = `<th class="c-name">${esc(p.bill_item_label)}</th>`;
  const qtyHead = `<th class="c-qty">${esc(p.bill_qty_label)}</th>`;
  const rate = showRate ? `<th class="c-price">${esc(p.bill_rate_label)}</th>` : '';
  return `<table>
    <thead><tr>${after ? `${nameHead}${qtyHead}` : `${qtyHead}${nameHead}`}${rate}<th class="c-total">${esc(p.bill_amount_label)}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function retailPaymentBlock(sale) {
  const payments = (sale.payments || []).filter((p) => Number(p.amount) > 0);
  const isSplit = payments.length > 1;
  const isCreditOnly = payments.length === 1 && payments[0].method === 'credit';
  const rows = [];

  if (isCreditOnly) {
    rows.push(metaFull('Payment', 'CREDIT'));
    if (sale.customer_name) rows.push(metaFull('Customer', sale.customer_name));
    rows.push(`<div class="r-row"><span class="r-b">Amount Due</span><span class="r-num r-b">${formatReceiptMoney(sale.amount_due, { prefix: true })}</span></div>`);
  } else {
    for (const pmt of payments) {
      rows.push(isSplit
        ? `<div class="r-row"><span>${esc(payLabel(pmt.method))}</span><span class="r-num">${money(pmt.amount)}</span></div>`
        : metaFull('Payment', payLabel(pmt.method)));
    }
    if (isSplit) {
      rows.push(`<div class="r-row"><span class="r-b">Total Paid</span><span class="r-num r-b">${money(sale.amount_paid)}</span></div>`);
    }
    const cashLeg = payments.find((p) => p.method === 'cash' && Number(p.cash_tendered) > 0);
    if (cashLeg) rows.push(`<div class="r-row"><span>Received</span><span class="r-num">${money(cashLeg.cash_tendered)}</span></div>`);
    const change = payments.reduce((s, p) => s + Number(p.change_given || 0), 0);
    if (change > 0) rows.push(`<div class="r-row"><span>Change</span><span class="r-num">${money(change)}</span></div>`);
  }
  if (Number(sale.amount_due) > 0 && !isCreditOnly) {
    rows.push(`<div class="r-row"><span class="r-b">Outstanding</span><span class="r-num r-b">${money(sale.amount_due)}</span></div>`);
  }
  return rows.length ? `<div class="r-totals">${rows.join('')}</div>` : '';
}

/**
 * Retail sale receipt.
 * @param {object} sale  the full retail_sales object from getRetailSale() (lines, payments)
 * @param {{ size?: string, reprint?: boolean, settings?: object }} opts
 */
export function printRetailReceipt(sale, { size = '80', reprint = false, settings = {} } = {}) {
  const p = resolvePrinterSettings(settings);
  const docTags = [];
  if (settingEnabled(p.bill_show_not_tax_invoice)) docTags.push('NOT A TAX INVOICE');
  if (reprint) docTags.push('DUPLICATE COPY');

  const body = `
    ${headerBlock({
      shop_name: settings.shop_name || SHOP_NAME_FALLBACK,
      shop_address: settings.shop_address,
      shop_phone: settings.shop_phone,
      vat_number: settings.vat_number,
      pan_number: settings.pan_number,
    }, p)}
    ${doctypeBlock(p.bill_title, docTags)}
    <div class="r-meta">
      ${metaRow(p.bill_number_label, sale.sale_number || `#${sale.id}`)}
      ${settingEnabled(p.bill_show_datetime) ? `<div class="r-meta-row"><span class="l">Date</span><span class="v">${esc(formatNepalDate(sale.completed_at))}</span></div><div class="r-meta-row"><span class="l">Time</span><span class="v">${esc(formatNepalClock(sale.completed_at))}</span></div>` : ''}
      ${settingEnabled(p.bill_show_cashier) && sale.cashier_name ? metaFull('Cashier', sale.cashier_name) : ''}
      ${settingEnabled(p.bill_show_customer) && sale.customer_name ? metaFull('Customer', sale.customer_name) : ''}
    </div>
    ${retailItemsTable(sale.lines, p)}
    ${totalsBlock({ subtotal: sale.subtotal, discount: sale.discount_amount, discount_label: sale.discount_reason, tax: sale.tax_amount, grand_total: sale.grand_total })}
    ${settingEnabled(p.bill_show_payment) ? retailPaymentBlock(sale) : ''}
    ${footerBlock({ receipt_footer: p.bill_footer }, { settings: p })}`;
  return openReceiptPrint({ title: `Sale ${sale.sale_number || sale.id}`, size, body });
}
