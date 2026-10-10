import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptMessage, receiptWhatsappLink, whatsappNumber } from '../../lib/whatsapp-receipt.js';

test('Nepali mobile numbers get the 977 country code', () => {
  assert.equal(whatsappNumber('9812345678'), '9779812345678');
  assert.equal(whatsappNumber('+977 981-234-5678'), '9779812345678');
  assert.equal(whatsappNumber('09812345678'), '9779812345678');
  assert.equal(whatsappNumber('12345'), '');
  assert.equal(whatsappNumber(null), '');
});

const sale = {
  id: 4, sale_number: 'INV-010', customer_name: 'Priya', customer_phone: '9812345678',
  lines: [{ quantity: 3, product_name_snapshot: 'Berry Cloud Claw Clip', variant_name_snapshot: 'Standard', net_amount: 297 }],
  discount_amount: 0, tax_amount: 0, grand_total: 297, amount_due: 0,
};

test('receipt text lists items and the total', () => {
  const text = receiptMessage(sale, { shopName: '99 Shop', date: 'today' });
  assert.match(text, /Receipt INV-010 · today/);
  assert.match(text, /• 3 × Berry Cloud Claw Clip — Rs 297\.00/);
  assert.match(text, /\*Total: Rs 297\.00\*/);
  assert.doesNotMatch(text, /Still to pay/);
});

test('link goes to the customer when their number is known, else to the picker', () => {
  assert.match(receiptWhatsappLink(sale), /^https:\/\/wa\.me\/9779812345678\?text=/);
  assert.match(receiptWhatsappLink({ ...sale, customer_phone: '' }), /^https:\/\/wa\.me\/\?text=/);
});
