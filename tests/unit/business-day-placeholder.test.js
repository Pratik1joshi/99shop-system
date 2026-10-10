import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database, { PosDatabase } from '../../lib/db/index.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { businessDayIdForCalendarDate, closeBusinessDay, openBusinessDay } from '../../lib/business-days.js';

const file = path.join(os.tmpdir(), `business-day-placeholder-${process.pid}-${Date.now()}.db`);
const usePostgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || '');
const db = usePostgres ? Database.getInstance() : new PosDatabase(file);
const actor = { id: 1, full_name: 'Phase Zero Admin', role: 'admin' };

test.after(async () => {
  try { await db.close(); } catch {}
  if (!usePostgres) {
    for (const suffix of ['', '-shm', '-wal']) try { fs.unlinkSync(`${file}${suffix}`); } catch {}
  }
});

test('a today-expense placeholder is promoted in place and can be opened normally', async () => {
  const today = getNepaliDateString();
  const placeholderId = await businessDayIdForCalendarDate(db, today);
  const before = await db.get(`SELECT * FROM business_days WHERE id=?`, [placeholderId]);
  assert.equal(before.status, 'closed');

  const opened = await openBusinessDay(db, { business_date: today, opening_cash: 0, opening_note: 'Real opening' }, actor);
  assert.equal(opened.id, placeholderId);
  assert.equal(opened.status, 'open');
  assert.equal(opened.promoted_historical_placeholder, true);
  assert.equal(opened.active_session.session_number, 1);

  await assert.rejects(
    openBusinessDay(db, { business_date: today, opening_cash: 0 }, actor),
    /already open|session is already open/i
  );
});

test('a genuinely closed business day is never reopened as a placeholder', async () => {
  const today = getNepaliDateString();
  const open = await db.get(`SELECT * FROM business_days WHERE business_date=?`, [today]);
  const session = await db.get(`SELECT * FROM business_day_sessions WHERE business_day_id=? AND status='open'`, [open.id]);
  await closeBusinessDay(db, { counted_cash: 0, session_id: session.id, force_close_reason: 'Isolated regression fixture' }, actor, { force: true });
  await db.run(`UPDATE business_days SET status='closed', closed_at=CURRENT_TIMESTAMP, closed_by=?, opening_note='Real opening' WHERE id=?`, [actor.id, open.id]);
  await assert.rejects(
    openBusinessDay(db, { business_date: today, opening_cash: 0 }, actor),
    /already exists in history/i
  );
});
