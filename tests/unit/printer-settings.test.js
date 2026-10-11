import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRINTER_DEFAULTS, printerSettingsPayload, resolvePrinterSettings, settingEnabled, qtyAfterItem } from '../../lib/printer-settings.js';

test('printer settings cover receipts and statements and preserve the receipt footer', () => {
  const settings = resolvePrinterSettings({ receipt_footer: 'Legacy thanks' });
  assert.equal(settings.bill_footer, 'Legacy thanks');
  assert.equal(settings.statement_paper_size, 'a4');
  assert.equal(settings.bill_title, 'RECEIPT');
  assert.equal(Object.keys(settings).some((key) => key.startsWith('kot_') || key.startsWith('qr_')), false);
  assert.equal(qtyAfterItem(settings.bill_qty_position), true);
  assert.equal(qtyAfterItem('before'), false);
});

test('printer payload persists every template option and serializes switches', () => {
  const payload = printerSettingsPayload({ bill_show_payment: false, statement_show_phone: false });
  assert.deepEqual(Object.keys(payload).sort(), Object.keys(PRINTER_DEFAULTS).sort());
  assert.equal(payload.bill_show_payment, 'false');
  assert.equal(payload.statement_show_phone, 'false');
  assert.equal(settingEnabled(payload.bill_show_payment), false);
});

test('retail shell keeps the accordion style without removed destinations', async () => {
  const source = await readFile(new URL('../../components/erp/app-shell.jsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label="Retail workspaces"/);
  assert.match(source, /name: 'People', tint: 'fuchsia'/);
  assert.match(source, /name: 'Accounting', tint: 'emerald'/);
  // 99 Shop workflows, and shared pages still reading 99 Shop facts, stay out of the Retail nav.
  assert.doesNotMatch(source, /href: '\/(admin|cashier)\/(kot|kots|tables|table-management|waiter-requests|recipes|kitchen-analytics|leads|reservations|bills|orders|wastage|inventory\/dashboard|finance-dashboard|corrections|previous-day-activity|suppliers)'/);
});

test('printed receipts and statements follow the saved templates', async () => {
  const { retailReceiptPage, creditStatementPage } = await import('../../lib/pos-print.js');
  const sale = {
    id: 9, sale_number: 'S-9', completed_at: '2026-10-11T04:00:00Z', cashier_name: 'Asha', customer_name: 'Ram',
    lines: [{ product_name_snapshot: 'Claw Clip', quantity: 2, unit_price: 250, net_amount: 500, discount_amount: 0 }],
    subtotal: 500, discount_amount: 0, tax_amount: 0, grand_total: 500, amount_paid: 500, amount_due: 0,
    payments: [{ method: 'cash', amount: 500, cash_tendered: 1000, change_given: 500 }],
  };
  const receipt = retailReceiptPage(sale, { size: '58', settings: {
    shop_name: 'Test Shop', bill_title: 'SALES BILL', bill_number_label: 'Bill no', bill_item_label: 'Product',
    bill_footer: 'Come again soon', bill_show_cashier: 'false', bill_show_payment: false,
  } });
  assert.equal(receipt.size, '58');
  for (const text of ['TEST SHOP', 'SALES BILL', 'Bill no', 'Product', 'Come again soon', 'Ram']) assert.match(receipt.body, new RegExp(text));
  assert.doesNotMatch(receipt.body, /Asha/);
  assert.doesNotMatch(receipt.body, /Change/);

  const statement = creditStatementPage({ kind: 'supplier', name: 'Supplier A', outstanding: 20, lines: [] }, {
    settings: { statement_paper_size: 'a4', statement_supplier_title: 'SUPPLIER LEDGER', statement_footer: 'Pay by Friday' },
  });
  assert.equal(statement.size, 'a4');
  assert.match(statement.body, /SUPPLIER LEDGER/);
  assert.match(statement.body, /Pay by Friday/);
});

test('Printer is in the sidebar for admins and for cashiers allowed to change settings', async () => {
  const source = await readFile(new URL('../../components/erp/app-shell.jsx', import.meta.url), 'utf8');
  assert.match(source, /name: 'Printer', href: '\/admin\/printer'/);
  assert.match(source, /name: 'Printer', href: '\/cashier\/printer', icon: Printer, color: 'text-pink-600', permission: 'settings.manage'/);
});
