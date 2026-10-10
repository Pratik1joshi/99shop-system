import test from 'node:test';
import assert from 'node:assert/strict';
import { voidEligibility } from '../../lib/retail-void.js';

const paidCash = { status: 'COMPLETED', payments: [{ method: 'cash', amount: 500 }], amountDue: 0, customerId: null };
const fresh = { ageMinutes: 5, returnsCount: 0, windowMinutes: 30 };

test('a fresh single-payment sale can be voided back to the same method', () => {
  assert.deepEqual(voidEligibility(paidCash, fresh), { ok: true, refundMethod: 'cash', minutesLeft: 25 });
  assert.equal(voidEligibility({ ...paidCash, payments: [{ method: 'online', amount: 500 }] }, fresh).refundMethod, 'online');
});

test('the window, earlier returns and non-completed sales block a void', () => {
  assert.equal(voidEligibility(paidCash, { ...fresh, ageMinutes: 31 }).ok, false);
  assert.equal(voidEligibility(paidCash, { ...fresh, returnsCount: 1 }).ok, false);
  assert.equal(voidEligibility({ ...paidCash, status: 'HELD' }, fresh).ok, false);
  assert.equal(voidEligibility(paidCash, { ...fresh, windowMinutes: 0 }).ok, false);
});

test('split payments go to the Return screen instead of guessing a refund method', () => {
  const split = { ...paidCash, payments: [{ method: 'cash', amount: 200 }, { method: 'online', amount: 300 }] };
  assert.equal(voidEligibility(split, fresh).ok, false);
});

test('credit sales reduce what the customer owes, and need a customer', () => {
  const credit = { status: 'COMPLETED', payments: [{ method: 'credit', amount: 500 }], amountDue: 500, customerId: 7 };
  assert.equal(voidEligibility(credit, fresh).refundMethod, 'ar_reduction');
  assert.equal(voidEligibility({ ...credit, customerId: null }, fresh).ok, false);
});
