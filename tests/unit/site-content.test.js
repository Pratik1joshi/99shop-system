import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PosDatabase } from '../../lib/db/index.js';
import { getSiteContent, saveSiteContent, CONTENT_DEFAULTS } from '../../lib/site-content.js';

const file = path.join(os.tmpdir(), `site-content-${process.pid}-${Date.now()}.db`);
const db = new PosDatabase(file);
test.after(async () => {
  try { await db.close(); } catch {}
  for (const suffix of ['', '-shm', '-wal']) try { fs.unlinkSync(`${file}${suffix}`); } catch {}
});

test('website logo accepts uploads and https links, and rejects anything else without a partial save', async () => {
  assert.equal((await getSiteContent(db))['shop.logo'], CONTENT_DEFAULTS['shop.logo']);
  await saveSiteContent(db, { 'shop.logo': '/uploads/menu/logo-1.jpg' });
  assert.equal((await getSiteContent(db))['shop.logo'], '/uploads/menu/logo-1.jpg');
  await saveSiteContent(db, { 'shop.logo': 'https://cdn.example.com/logo.png' });
  for (const bad of ['javascript:alert(1)', '/uploads/menu/a.jpg" onerror="x', 'http://example.com/a.png']) {
    await assert.rejects(() => saveSiteContent(db, { 'shop.name': 'Changed', 'shop.logo': bad }), { status: 400 });
  }
  const content = await getSiteContent(db);
  assert.equal(content['shop.logo'], 'https://cdn.example.com/logo.png');
  assert.equal(content['shop.name'], CONTENT_DEFAULTS['shop.name'], 'a rejected save writes nothing');
  await saveSiteContent(db, { 'shop.logo': '' });
  assert.equal((await getSiteContent(db))['shop.logo'], CONTENT_DEFAULTS['shop.logo']);
});
