import test from 'node:test';
import assert from 'node:assert/strict';

// pos-print.js only touches `window` inside openReceiptPrint(); stub it so the
// template-building logic (the part with real branching) runs under `node --test`
// and we can assert on the exact HTML it would have sent to the print window.
function withStubbedPrintWindow(run) {
  let captured = '';
  global.window = {
    open: () => ({
      document: { write: (html) => { captured += html; }, close: () => {} },
      focus: () => {},
      print: () => {},
      close: () => {},
    }),
  };
  try {
    run();
    return captured;
  } finally {
    delete global.window;
  }
}

const { printRetailReceipt, printCreditStatement } = await import('../../lib/pos-print.js');

const baseSale = {
  id: 12,
  sale_number: 'S-0012',
  completed_at: '2026-08-13T08:56:00Z',
  cashier_name: 'Pratik',
  customer_name: '',
  subtotal: 1005,
  discount_amount: 0,
  tax_amount: 0,
  grand_total: 1005,
  amount_paid: 1005,
  amount_due: 0,
  lines: [
    { product_name_snapshot: 'Heart Crown Claw Clip', variant_name_snapshot: 'Pink', sku_snapshot: 'CLIP-PINK', quantity: 2, unit_price: 250, net_amount: 500, discount_amount: 0 },
    { product_name_snapshot: 'Cherry Bag Charm', variant_name_snapshot: 'Standard', quantity: 1, unit_price: 505, net_amount: 505, discount_amount: 0 },
  ],
  payments: [{ method: 'cash', amount: 1005, cash_tendered: 1100, change_given: 95 }],
};
const shop = { shop_name: '99 Shop by Shahana', shop_address: 'Surkhet, Nepal', shop_phone: '9800000000', pan_number: '123456789' };

test('cash sale: shows RECEIPT, not a duplicate, with received/change', () => {
  const html = withStubbedPrintWindow(() => printRetailReceipt(baseSale, { size: '80', settings: shop }));
  assert.match(html, /<div class="r-b">RECEIPT<\/div>/);
  assert.match(html, /NOT A TAX INVOICE/);
  assert.doesNotMatch(html, /<div class="r-b">TAX INVOICE<\/div>/); // never claims a bare tax invoice
  assert.doesNotMatch(html, /DUPLICATE COPY/);
  assert.match(html, /S-0012/);
  assert.match(html, /1,005\.00/); // grand total
  assert.match(html, />Received</);
  assert.match(html, />Change</);
  assert.match(html, /Pink · SKU CLIP-PINK/); // variant and SKU under the item
  assert.match(html, /99 SHOP BY SHAHANA/);
});

test('reprint flag prints DUPLICATE COPY without changing the number or totals', () => {
  const html = withStubbedPrintWindow(() => printRetailReceipt(baseSale, { size: '80', reprint: true, settings: shop }));
  assert.match(html, /DUPLICATE COPY/);
  assert.match(html, /S-0012/);
  assert.match(html, /1,005\.00/);
});

test('sale timestamp prints in Nepal time without applying the offset twice', async () => {
  const { parseNepalWallClockTimestamp } = await import('../../lib/db/postgres.js');
  const completedAt = parseNepalWallClockTimestamp('2026-08-29 21:28:00.552194').toISOString();
  const html = withStubbedPrintWindow(() => printRetailReceipt({ ...baseSale, completed_at: completedAt }, { size: '80', settings: shop }));
  assert.match(html, /29 Aug 2026/);
  assert.match(html, /09:28 PM/i);
});

test('split payment lists each method plus a Total Paid line', () => {
  const sale = { ...baseSale, payments: [{ method: 'cash', amount: 505 }, { method: 'online', amount: 500 }] };
  const html = withStubbedPrintWindow(() => printRetailReceipt(sale, { size: '80', settings: shop }));
  assert.match(html, />Cash</);
  assert.match(html, />Online</);
  assert.match(html, /Total Paid/);
});

test('credit sale shows CREDIT payment and Amount Due', () => {
  const sale = { ...baseSale, customer_name: 'Ram', amount_paid: 0, amount_due: 1005, payments: [{ method: 'credit', amount: 1005 }] };
  const html = withStubbedPrintWindow(() => printRetailReceipt(sale, { size: '80', settings: shop }));
  assert.match(html, /CREDIT/);
  assert.match(html, /Amount Due/);
  assert.match(html, /Ram/);
});

test('zero-value discount and tax rows are hidden, not printed as clutter', () => {
  const html = withStubbedPrintWindow(() => printRetailReceipt(baseSale, { size: '80', settings: shop }));
  assert.doesNotMatch(html, />Discount</);
  assert.doesNotMatch(html, />VAT</);
});

test('large amounts keep grouped formatting (no broken/NaN totals)', () => {
  const sale = { ...baseSale, subtotal: 1234567.5, grand_total: 1234567.5, amount_paid: 1234567.5, payments: [{ method: 'online', amount: 1234567.5 }] };
  const html = withStubbedPrintWindow(() => printRetailReceipt(sale, { size: '80', settings: shop }));
  assert.match(html, /12,34,567\.50|1,234,567\.50/);
  assert.doesNotMatch(html, /NaN/);
});

test('receipt title, labels and optional lines are configurable', () => {
  const html = withStubbedPrintWindow(() => printRetailReceipt(baseSale, {
    settings: {
      ...shop,
      bill_title: 'SALES RECEIPT', bill_number_label: 'Bill No', bill_item_label: 'Product',
      bill_amount_label: 'Total', bill_show_cashier: 'false', bill_show_pan: 'false', bill_show_not_tax_invoice: 'false',
    },
  }));
  assert.match(html, /SALES RECEIPT/);
  assert.match(html, />Bill No</);
  assert.match(html, />Product</);
  assert.match(html, />Total</);
  assert.doesNotMatch(html, /Pratik/);
  assert.doesNotMatch(html, /PAN:/);
  assert.doesNotMatch(html, /NOT A TAX INVOICE/);
});

test('quantity prints after the item name by default and can move before it', () => {
  const after = withStubbedPrintWindow(() => printRetailReceipt(baseSale, { settings: shop }));
  assert.ok(after.indexOf('Heart Crown Claw Clip') < after.indexOf('<td class="c-qty r-num">2</td>'));
  const before = withStubbedPrintWindow(() => printRetailReceipt(baseSale, { settings: { ...shop, bill_qty_position: 'before' } }));
  assert.ok(before.indexOf('<td class="c-qty r-num">2</td>') < before.indexOf('Heart Crown Claw Clip'));
});

test('credit statements default to a full A4 print page', () => {
  const html = withStubbedPrintWindow(() => printCreditStatement({ kind: 'customer', name: 'Ram', outstanding: 500, lines: [] }));
  assert.match(html, /@page \{ size: A4;/);
  assert.match(html, /CUSTOMER CREDIT STATEMENT/);
  assert.match(html, /width: 190mm/);
});
