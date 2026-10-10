/**
 * Document numbers: one counter per document type. Giving two documents of the
 * same type separate counters would let two numbers share a serial — an audit
 * hole. These tests pin that down.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { formatDocumentNumber, nextDocumentNumber } from '../../lib/document-numbers.js';

function memoryDb() {
  const raw = new DatabaseSync(':memory:');
  return {
    driver: 'sqlite',
    all: async (sql, params = []) => raw.prepare(sql).all(...(params || [])),
    get: async (sql, params = []) => raw.prepare(sql).get(...(params || [])),
    run: async (sql, params = []) => raw.prepare(sql).run(...(params || [])),
  };
}

test('numbers are zero-padded to three digits behind the prefix', () => {
  assert.equal(formatDocumentNumber('INV', 1), 'INV-001');
  assert.equal(formatDocumentNumber('grn', 42), 'GRN-042');
  assert.equal(formatDocumentNumber('CN', 1234), 'CN-1234');
});

test('each document type keeps its own continuous serial', async () => {
  const db = memoryDb();
  const sales = [];
  for (let i = 0; i < 3; i += 1) sales.push(await nextDocumentNumber(db, { type: 'retail_sale', prefix: 'INV' }));
  const receipts = [];
  for (let i = 0; i < 2; i += 1) receipts.push(await nextDocumentNumber(db, { type: 'goods_receipt', prefix: 'GRN' }));
  assert.deepEqual(sales, ['INV-001', 'INV-002', 'INV-003']);
  assert.deepEqual(receipts, ['GRN-001', 'GRN-002']);
});

test('no two documents of one type share a serial', async () => {
  const db = memoryDb();
  const seen = new Set();
  for (let i = 0; i < 30; i += 1) {
    const number = await nextDocumentNumber(db, { type: 'retail_sale', prefix: 'INV' });
    assert.equal(seen.has(number), false, `${number} was issued twice`);
    seen.add(number);
  }
  assert.equal(seen.size, 30);
});

test('a seed starts the counter above existing numbers', async () => {
  const db = memoryDb();
  assert.equal(await nextDocumentNumber(db, { type: 'retail_return', prefix: 'CN', seed: 40 }), 'CN-041');
  assert.equal(await nextDocumentNumber(db, { type: 'retail_return', prefix: 'CN' }), 'CN-042');
});

test('type and prefix are both required', async () => {
  const db = memoryDb();
  await assert.rejects(() => nextDocumentNumber(db, { type: 'retail_sale' }), /type and prefix are required/);
  await assert.rejects(() => nextDocumentNumber(db, { prefix: 'INV' }), /type and prefix are required/);
});
