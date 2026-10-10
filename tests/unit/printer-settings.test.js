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
